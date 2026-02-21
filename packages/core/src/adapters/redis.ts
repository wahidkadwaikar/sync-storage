import { createClient, type RedisClientType } from 'redis'
import { PreconditionFailedError } from '../errors.js'
import type { JsonValue, ListResult, StorageScope, StoredItem } from '../types.js'
import {
  decodeCursor,
  encodeCursor,
  etagFromVersion,
  isExpired,
  nowIso,
  parseJson,
  serializeJson,
} from '../utils.js'
import type {
  BatchPutEntry,
  DeleteOptions,
  ListOptions,
  PutOptions,
  StorageAdapter,
} from './types.js'

interface RedisEnvelope {
  valueJson: string
  version: number
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface RedisAdapterOptions {
  url: string
  password?: string
  database?: number
}

export class RedisStorageAdapter implements StorageAdapter {
  private readonly client: RedisClientType
  private readonly ready: Promise<void>

  constructor(options: RedisAdapterOptions) {
    this.client = createClient({
      url: options.url,
      password: options.password,
      database: options.database,
    })
    this.client.on('error', (error) => {
      console.error('Redis adapter error', error)
    })
    this.ready = this.client.connect().then(() => undefined)
  }

  async get(scope: StorageScope, key: string): Promise<StoredItem | null> {
    await this.ready
    const redisKey = this.toRedisKey(scope, key)
    const raw = await this.client.get(redisKey)
    if (!raw) {
      return null
    }

    const envelope = this.parseEnvelope(raw)
    if (isExpired(envelope.expiresAt)) {
      await this.client.del(redisKey)
      return null
    }

    return this.toStoredItem(key, envelope)
  }

  async put(
    scope: StorageScope,
    key: string,
    value: JsonValue,
    options: PutOptions = {}
  ): Promise<StoredItem> {
    await this.ready
    const redisKey = this.toRedisKey(scope, key)
    const now = new Date()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.client.watch(redisKey)
      const currentRaw = await this.client.get(redisKey)
      const currentEnvelope = currentRaw ? this.parseEnvelope(currentRaw) : null
      const activeCurrent =
        currentEnvelope && !isExpired(currentEnvelope.expiresAt) ? currentEnvelope : null

      if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== null) {
        if (!activeCurrent || activeCurrent.version !== options.ifMatchVersion) {
          await this.client.unwatch()
          throw new PreconditionFailedError('If-Match version does not match current value')
        }
      }

      const version = activeCurrent ? activeCurrent.version + 1 : 1
      const expiresAt = options.ttlSeconds
        ? nowIso(new Date(now.getTime() + options.ttlSeconds * 1000))
        : null
      const envelope: RedisEnvelope = {
        valueJson: serializeJson(value),
        version,
        createdAt: activeCurrent?.createdAt ?? nowIso(now),
        updatedAt: nowIso(now),
        expiresAt,
      }

      const multi = this.client.multi()
      if (options.ttlSeconds) {
        multi.set(redisKey, JSON.stringify(envelope), { EX: options.ttlSeconds })
      } else {
        multi.set(redisKey, JSON.stringify(envelope))
      }

      const committed = await multi.exec()
      if (committed !== null) {
        return this.toStoredItem(key, envelope)
      }
    }

    throw new PreconditionFailedError('Concurrent write prevented storing value after retries')
  }

  async delete(scope: StorageScope, key: string, options: DeleteOptions = {}): Promise<boolean> {
    await this.ready
    const redisKey = this.toRedisKey(scope, key)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.client.watch(redisKey)
      const currentRaw = await this.client.get(redisKey)
      if (!currentRaw) {
        await this.client.unwatch()
        return false
      }

      const currentEnvelope = this.parseEnvelope(currentRaw)
      if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== null) {
        if (
          isExpired(currentEnvelope.expiresAt) ||
          currentEnvelope.version !== options.ifMatchVersion
        ) {
          await this.client.unwatch()
          throw new PreconditionFailedError('If-Match version does not match current value')
        }
      }

      const multi = this.client.multi()
      multi.del(redisKey)
      const committed = await multi.exec()
      if (committed !== null) {
        return !isExpired(currentEnvelope.expiresAt)
      }
    }

    throw new PreconditionFailedError('Concurrent delete prevented completion after retries')
  }

  async batchGet(scope: StorageScope, keys: string[]): Promise<Record<string, StoredItem | null>> {
    await this.ready
    const redisKeys = keys.map((key) => this.toRedisKey(scope, key))
    const values = await this.client.mGet(redisKeys)

    const result: Record<string, StoredItem | null> = {}
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!
      const raw = values[index]
      if (!raw) {
        result[key] = null
        continue
      }

      const envelope = this.parseEnvelope(raw)
      if (isExpired(envelope.expiresAt)) {
        result[key] = null
        continue
      }

      result[key] = this.toStoredItem(key, envelope)
    }

    return result
  }

  async batchPut(
    scope: StorageScope,
    entries: BatchPutEntry[]
  ): Promise<Record<string, StoredItem>> {
    const result: Record<string, StoredItem> = {}
    for (const entry of entries) {
      result[entry.key] = await this.put(scope, entry.key, entry.value, {
        ttlSeconds: entry.ttlSeconds,
        ifMatchVersion: entry.ifMatchVersion,
      })
    }
    return result
  }

  async list(scope: StorageScope, options: ListOptions = {}): Promise<ListResult> {
    await this.ready
    const limit = options.limit ?? 50
    const cursorKey = decodeCursor(options.cursor)
    const prefix = options.prefix ?? ''
    const pattern = `${this.toScopePrefix(scope)}${prefix}*`

    const found: Array<{ key: string; item: StoredItem }> = []

    for await (const redisKey of this.client.scanIterator({ MATCH: pattern, COUNT: 200 })) {
      const key = this.fromRedisKey(redisKey)
      if (!key) {
        continue
      }
      if (cursorKey && key <= cursorKey) {
        continue
      }

      const raw = await this.client.get(redisKey)
      if (!raw) {
        continue
      }
      const envelope = this.parseEnvelope(raw)
      if (isExpired(envelope.expiresAt)) {
        continue
      }

      found.push({ key, item: this.toStoredItem(key, envelope) })
    }

    found.sort((left, right) => left.key.localeCompare(right.key))
    const page = found.slice(0, limit)
    const next = found.length > limit && page.length > 0 ? page[page.length - 1] : null

    return {
      items: page.map((entry) => entry.item),
      nextCursor: next ? encodeCursor(next.key) : null,
    }
  }

  async health(): Promise<{ ok: boolean; details?: string }> {
    try {
      await this.ready
      const pong = await this.client.ping()
      return { ok: pong === 'PONG', details: pong }
    } catch (error) {
      return { ok: false, details: String(error) }
    }
  }

  async close(): Promise<void> {
    await this.client.quit()
  }

  private toRedisKey(scope: StorageScope, key: string): string {
    return `${this.toScopePrefix(scope)}${key}`
  }

  private toScopePrefix(scope: StorageScope): string {
    return `t:${scope.tenantId}:n:${scope.namespace}:u:${scope.userId}:k:`
  }

  private fromRedisKey(redisKey: string): string | null {
    const marker = ':k:'
    const markerIndex = redisKey.indexOf(marker)
    if (markerIndex < 0) {
      return null
    }

    return redisKey.slice(markerIndex + marker.length)
  }

  private parseEnvelope(raw: string): RedisEnvelope {
    const parsed = JSON.parse(raw) as RedisEnvelope
    return {
      valueJson: parsed.valueJson,
      version: parsed.version,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      expiresAt: parsed.expiresAt,
    }
  }

  private toStoredItem(key: string, envelope: RedisEnvelope): StoredItem {
    return {
      key,
      value: parseJson(envelope.valueJson),
      version: envelope.version,
      etag: etagFromVersion(envelope.version),
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
      expiresAt: envelope.expiresAt,
    }
  }
}

export function createRedisAdapter(options: RedisAdapterOptions): RedisStorageAdapter {
  return new RedisStorageAdapter(options)
}

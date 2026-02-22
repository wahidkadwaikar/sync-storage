import { PreconditionFailedError, ValidationError } from '../errors.js'
import type { BatchPutEntry, ListOptions, StorageAdapter } from '../adapters/types.js'
import type { JsonValue, ListResult, StorageScope, StoredItem } from '../types.js'
import { clampLimit, normalizeIfMatch, serializeJson } from '../utils.js'

export interface StorageServiceOptions {
  maxKeyLength?: number
  maxValueBytes?: number
  maxBatchSize?: number
  maxListLimit?: number
}

export class StorageService {
  private readonly maxKeyLength: number
  private readonly maxValueBytes: number
  private readonly maxBatchSize: number
  private readonly maxListLimit: number

  constructor(
    private readonly adapter: StorageAdapter,
    options: StorageServiceOptions = {}
  ) {
    this.maxKeyLength = options.maxKeyLength ?? 255
    this.maxValueBytes = options.maxValueBytes ?? 1024 * 1024
    this.maxBatchSize = options.maxBatchSize ?? 100
    this.maxListLimit = options.maxListLimit ?? 100
  }

  async getItem(scope: StorageScope, key: string): Promise<StoredItem | null> {
    this.validateScope(scope)
    this.validateKey(key)
    return this.adapter.get(scope, key)
  }

  async setItem(
    scope: StorageScope,
    key: string,
    value: JsonValue,
    options: { ttlSeconds?: number; ifMatch?: string | null } = {}
  ): Promise<StoredItem> {
    this.validateScope(scope)
    this.validateKey(key)
    this.validateValue(value)
    const ttlSeconds = this.validateTtlSeconds(options.ttlSeconds)
    const ifMatchVersion = this.validateIfMatch(options.ifMatch)

    return this.adapter.put(scope, key, value, { ttlSeconds, ifMatchVersion })
  }

  async removeItem(
    scope: StorageScope,
    key: string,
    options: { ifMatch?: string | null } = {}
  ): Promise<boolean> {
    this.validateScope(scope)
    this.validateKey(key)
    const ifMatchVersion = this.validateIfMatch(options.ifMatch)

    return this.adapter.delete(scope, key, { ifMatchVersion })
  }

  async batchGet(scope: StorageScope, keys: string[]): Promise<Record<string, StoredItem | null>> {
    this.validateScope(scope)
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new ValidationError('keys must be a non-empty array')
    }
    if (keys.length > this.maxBatchSize) {
      throw new ValidationError(`keys length cannot exceed ${this.maxBatchSize}`)
    }
    for (const key of keys) {
      this.validateKey(key)
    }

    return this.adapter.batchGet(scope, keys)
  }

  async batchPut(
    scope: StorageScope,
    entries: BatchPutEntry[]
  ): Promise<Record<string, StoredItem>> {
    this.validateScope(scope)
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new ValidationError('entries must be a non-empty array')
    }
    if (entries.length > this.maxBatchSize) {
      throw new ValidationError(`entries length cannot exceed ${this.maxBatchSize}`)
    }

    for (const entry of entries) {
      this.validateKey(entry.key)
      this.validateValue(entry.value)
      this.validateTtlSeconds(entry.ttlSeconds)
      entry.ifMatchVersion = this.validateIfMatch(
        entry.ifMatchVersion === undefined || entry.ifMatchVersion === null
          ? null
          : String(entry.ifMatchVersion)
      )
    }

    return this.adapter.batchPut(scope, entries)
  }

  async list(scope: StorageScope, options: ListOptions = {}): Promise<ListResult> {
    this.validateScope(scope)
    if (options.prefix !== undefined && options.prefix.length > this.maxKeyLength) {
      throw new ValidationError(`prefix length cannot exceed ${this.maxKeyLength}`)
    }

    const limit = clampLimit(options.limit, this.maxListLimit, 50)
    return this.adapter.list(scope, {
      prefix: options.prefix,
      cursor: options.cursor,
      limit,
    })
  }

  async health(): Promise<{ ok: boolean; details?: string }> {
    return this.adapter.health()
  }

  private validateScope(scope: StorageScope): void {
    if (!scope.tenantId || !scope.namespace || !scope.userId) {
      throw new ValidationError('tenantId, namespace, and userId are required')
    }
  }

  private validateKey(key: string): void {
    if (!key) {
      throw new ValidationError('key is required')
    }
    if (key.length > this.maxKeyLength) {
      throw new ValidationError(`key length cannot exceed ${this.maxKeyLength}`)
    }
  }

  private validateValue(value: JsonValue): void {
    const serialized = serializeJson(value)
    const bytes = Buffer.byteLength(serialized, 'utf8')
    if (bytes > this.maxValueBytes) {
      throw new ValidationError(`value cannot exceed ${this.maxValueBytes} bytes`)
    }
  }

  private validateIfMatch(ifMatch: string | null | undefined): number | null {
    if (ifMatch === undefined || ifMatch === null || ifMatch.length === 0) {
      return null
    }

    const version = normalizeIfMatch(ifMatch)
    if (!version) {
      throw new PreconditionFailedError('If-Match header is invalid')
    }

    return version
  }

  private validateTtlSeconds(ttlSeconds: number | undefined): number | undefined {
    if (ttlSeconds === undefined) {
      return undefined
    }

    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new ValidationError('ttlSeconds must be a positive integer')
    }

    return ttlSeconds
  }
}

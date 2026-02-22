import { createClient } from '@libsql/client'
import { and, asc, eq, gt, isNull, like, or, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { sqliteItems } from '@sync-storage/db'
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

export interface TursoAdapterOptions {
  url: string
  authToken?: string
}

type TursoRow = typeof sqliteItems.$inferSelect

export class TursoStorageAdapter implements StorageAdapter {
  private readonly client
  private readonly db

  constructor(options: TursoAdapterOptions) {
    this.client = createClient({
      url: options.url,
      authToken: options.authToken,
    })
    this.db = drizzle(this.client)
  }

  async initialize(): Promise<void> {
    await this.client.batch(
      [
        `CREATE TABLE IF NOT EXISTS items (
          tenant_id TEXT NOT NULL,
          namespace TEXT NOT NULL,
          user_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tenant_id, namespace, user_id, key)
        );`,
        'CREATE INDEX IF NOT EXISTS idx_items_lookup ON items (tenant_id, namespace, user_id, key);',
        'CREATE INDEX IF NOT EXISTS idx_items_expiry ON items (expires_at);',
      ],
      'write'
    )
  }

  async get(scope: StorageScope, key: string): Promise<StoredItem | null> {
    const row = await this.getRow(scope, key, true)
    if (!row) {
      return null
    }

    return this.toStoredItem(row)
  }

  async put(
    scope: StorageScope,
    key: string,
    value: JsonValue,
    options: PutOptions = {}
  ): Promise<StoredItem> {
    const now = new Date()
    const isoNow = nowIso(now)
    const current = await this.getRow(scope, key, false)
    const activeCurrent = current && !isExpired(current.expiresAt) ? current : null

    if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== null) {
      if (!activeCurrent || activeCurrent.version !== options.ifMatchVersion) {
        throw new PreconditionFailedError('If-Match version does not match current value')
      }
    }

    const version = activeCurrent ? activeCurrent.version + 1 : 1
    const expiresAt = options.ttlSeconds
      ? nowIso(new Date(now.getTime() + options.ttlSeconds * 1000))
      : null
    const valueJson = serializeJson(value)

    await this.db
      .insert(sqliteItems)
      .values({
        tenantId: scope.tenantId,
        namespace: scope.namespace,
        userId: scope.userId,
        key,
        valueJson,
        version,
        expiresAt,
        createdAt: activeCurrent?.createdAt ?? isoNow,
        updatedAt: isoNow,
      })
      .onConflictDoUpdate({
        target: [sqliteItems.tenantId, sqliteItems.namespace, sqliteItems.userId, sqliteItems.key],
        set: {
          valueJson,
          version,
          expiresAt,
          updatedAt: isoNow,
        },
      })

    return {
      key,
      value,
      version,
      etag: etagFromVersion(version),
      createdAt: activeCurrent?.createdAt ?? isoNow,
      updatedAt: isoNow,
      expiresAt,
    }
  }

  async delete(scope: StorageScope, key: string, options: DeleteOptions = {}): Promise<boolean> {
    const current = await this.getRow(scope, key, false)
    if (!current) {
      return false
    }

    if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== null) {
      if (isExpired(current.expiresAt) || current.version !== options.ifMatchVersion) {
        throw new PreconditionFailedError('If-Match version does not match current value')
      }
    }

    await this.db
      .delete(sqliteItems)
      .where(
        and(
          eq(sqliteItems.tenantId, scope.tenantId),
          eq(sqliteItems.namespace, scope.namespace),
          eq(sqliteItems.userId, scope.userId),
          eq(sqliteItems.key, key)
        )
      )

    return !isExpired(current.expiresAt)
  }

  async batchGet(scope: StorageScope, keys: string[]): Promise<Record<string, StoredItem | null>> {
    const result: Record<string, StoredItem | null> = {}
    await Promise.all(
      keys.map(async (key) => {
        result[key] = await this.get(scope, key)
      })
    )
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
    const limit = options.limit ?? 50
    const cursorKey = decodeCursor(options.cursor)
    const currentIso = nowIso(new Date())
    const notExpiredClause = or(
      isNull(sqliteItems.expiresAt),
      gt(sqliteItems.expiresAt, currentIso)
    )

    if (!notExpiredClause) {
      throw new Error('Failed to construct expiry clause')
    }

    const clauses: SQL<unknown>[] = [
      eq(sqliteItems.tenantId, scope.tenantId),
      eq(sqliteItems.namespace, scope.namespace),
      eq(sqliteItems.userId, scope.userId),
      notExpiredClause,
    ]

    if (options.prefix) {
      clauses.push(like(sqliteItems.key, `${options.prefix}%`))
    }

    if (cursorKey) {
      clauses.push(gt(sqliteItems.key, cursorKey))
    }

    const rows = await this.db
      .select()
      .from(sqliteItems)
      .where(and(...clauses))
      .orderBy(asc(sqliteItems.key))
      .limit(limit + 1)

    const page = rows.slice(0, limit).map((row) => this.toStoredItem(row))
    const nextCursor =
      rows.length > limit && page.length > 0 ? encodeCursor(page[page.length - 1]!.key) : null

    return {
      items: page,
      nextCursor,
    }
  }

  async health(): Promise<{ ok: boolean; details?: string }> {
    try {
      await this.client.execute('SELECT 1')
      return { ok: true }
    } catch (error) {
      return { ok: false, details: String(error) }
    }
  }

  async close(): Promise<void> {
    await this.client.close()
  }

  private async getRow(
    scope: StorageScope,
    key: string,
    onlyActive: boolean
  ): Promise<TursoRow | null> {
    const clauses: SQL<unknown>[] = [
      eq(sqliteItems.tenantId, scope.tenantId),
      eq(sqliteItems.namespace, scope.namespace),
      eq(sqliteItems.userId, scope.userId),
      eq(sqliteItems.key, key),
    ]

    if (onlyActive) {
      const currentIso = nowIso(new Date())
      const notExpiredClause = or(
        isNull(sqliteItems.expiresAt),
        gt(sqliteItems.expiresAt, currentIso)
      )
      if (!notExpiredClause) {
        throw new Error('Failed to construct expiry clause')
      }
      clauses.push(notExpiredClause)
    }

    const rows = await this.db
      .select()
      .from(sqliteItems)
      .where(and(...clauses))
      .limit(1)
    return rows[0] ?? null
  }

  private toStoredItem(row: TursoRow): StoredItem {
    return {
      key: row.key,
      value: parseJson(row.valueJson),
      version: row.version,
      etag: etagFromVersion(row.version),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      expiresAt: row.expiresAt,
    }
  }
}

export async function createTursoAdapter(
  options: TursoAdapterOptions
): Promise<TursoStorageAdapter> {
  const adapter = new TursoStorageAdapter(options)
  await adapter.initialize()
  return adapter
}

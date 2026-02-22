import { and, asc, eq, gt, isNull, like, or, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { pgItems } from '@sync-storage/db'
import { PreconditionFailedError } from '../errors.js'
import type { JsonValue, ListResult, StorageScope, StoredItem } from '../types.js'
import {
  decodeCursor,
  encodeCursor,
  etagFromVersion,
  isExpired,
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

export interface PostgresAdapterOptions {
  connectionString: string
}

type PostgresRow = typeof pgItems.$inferSelect

export class PostgresStorageAdapter implements StorageAdapter {
  private readonly pool: Pool
  private readonly db: ReturnType<typeof drizzle>

  constructor(options: PostgresAdapterOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
    })
    this.db = drizzle(this.pool)
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        tenant_id VARCHAR(128) NOT NULL,
        namespace VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        key VARCHAR(255) NOT NULL,
        value_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, namespace, user_id, key)
      );
      CREATE INDEX IF NOT EXISTS idx_items_lookup ON items (tenant_id, namespace, user_id, key);
      CREATE INDEX IF NOT EXISTS idx_items_expiry ON items (expires_at);
    `)
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
    const current = await this.getRow(scope, key, false)
    const activeCurrent =
      current && !isExpired(current.expiresAt?.toISOString() ?? null) ? current : null

    if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== null) {
      if (!activeCurrent || activeCurrent.version !== options.ifMatchVersion) {
        throw new PreconditionFailedError('If-Match version does not match current value')
      }
    }

    const version = activeCurrent ? activeCurrent.version + 1 : 1
    const expiresAt = options.ttlSeconds
      ? new Date(now.getTime() + options.ttlSeconds * 1000)
      : null
    const valueJson = serializeJson(value)

    await this.db
      .insert(pgItems)
      .values({
        tenantId: scope.tenantId,
        namespace: scope.namespace,
        userId: scope.userId,
        key,
        valueJson,
        version,
        expiresAt,
        createdAt: activeCurrent?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [pgItems.tenantId, pgItems.namespace, pgItems.userId, pgItems.key],
        set: {
          valueJson,
          version,
          expiresAt,
          updatedAt: now,
        },
      })

    return {
      key,
      value,
      version,
      etag: etagFromVersion(version),
      createdAt: (activeCurrent?.createdAt ?? now).toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
    }
  }

  async delete(scope: StorageScope, key: string, options: DeleteOptions = {}): Promise<boolean> {
    const current = await this.getRow(scope, key, false)
    if (!current) {
      return false
    }

    if (options.ifMatchVersion !== undefined && options.ifMatchVersion !== null) {
      const expired = isExpired(current.expiresAt?.toISOString() ?? null)
      if (expired || current.version !== options.ifMatchVersion) {
        throw new PreconditionFailedError('If-Match version does not match current value')
      }
    }

    await this.db
      .delete(pgItems)
      .where(
        and(
          eq(pgItems.tenantId, scope.tenantId),
          eq(pgItems.namespace, scope.namespace),
          eq(pgItems.userId, scope.userId),
          eq(pgItems.key, key)
        )
      )

    return !isExpired(current.expiresAt?.toISOString() ?? null)
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
    const now = new Date()
    const notExpiredClause = or(isNull(pgItems.expiresAt), gt(pgItems.expiresAt, now))

    if (!notExpiredClause) {
      throw new Error('Failed to construct expiry clause')
    }

    const clauses: SQL<unknown>[] = [
      eq(pgItems.tenantId, scope.tenantId),
      eq(pgItems.namespace, scope.namespace),
      eq(pgItems.userId, scope.userId),
      notExpiredClause,
    ]

    if (options.prefix) {
      clauses.push(like(pgItems.key, `${options.prefix}%`))
    }

    if (cursorKey) {
      clauses.push(gt(pgItems.key, cursorKey))
    }

    const rows = await this.db
      .select()
      .from(pgItems)
      .where(and(...clauses))
      .orderBy(asc(pgItems.key))
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
      await this.pool.query('SELECT 1')
      return { ok: true }
    } catch (error) {
      return { ok: false, details: String(error) }
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private async getRow(
    scope: StorageScope,
    key: string,
    onlyActive: boolean
  ): Promise<PostgresRow | null> {
    const clauses: SQL<unknown>[] = [
      eq(pgItems.tenantId, scope.tenantId),
      eq(pgItems.namespace, scope.namespace),
      eq(pgItems.userId, scope.userId),
      eq(pgItems.key, key),
    ]

    if (onlyActive) {
      const notExpiredClause = or(isNull(pgItems.expiresAt), gt(pgItems.expiresAt, new Date()))
      if (!notExpiredClause) {
        throw new Error('Failed to construct expiry clause')
      }
      clauses.push(notExpiredClause)
    }

    const rows = await this.db
      .select()
      .from(pgItems)
      .where(and(...clauses))
      .limit(1)
    return rows[0] ?? null
  }

  private toStoredItem(row: PostgresRow): StoredItem {
    return {
      key: row.key,
      value: parseJson(row.valueJson),
      version: row.version,
      etag: etagFromVersion(row.version),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    }
  }
}

export async function createPostgresAdapter(
  options: PostgresAdapterOptions
): Promise<PostgresStorageAdapter> {
  const adapter = new PostgresStorageAdapter(options)
  await adapter.initialize()
  return adapter
}

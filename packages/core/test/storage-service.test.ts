import { describe, expect, it } from 'vitest'
import {
  PreconditionFailedError,
  StorageService,
  ValidationError,
  type BatchPutEntry,
  type StorageAdapter,
  type StorageScope,
  type StoredItem,
} from '../src/index.js'

class MemoryAdapter implements StorageAdapter {
  private readonly store = new Map<string, StoredItem>()

  async get(scope: StorageScope, key: string): Promise<StoredItem | null> {
    return this.store.get(this.id(scope, key)) ?? null
  }

  async put(scope: StorageScope, key: string, value: any, options = {}): Promise<StoredItem> {
    const id = this.id(scope, key)
    const current = this.store.get(id)
    if (options.ifMatchVersion && (!current || current.version !== options.ifMatchVersion)) {
      throw new PreconditionFailedError('If-Match mismatch')
    }

    const version = current ? current.version + 1 : 1
    const now = new Date().toISOString()
    const expiresAt = options.ttlSeconds
      ? new Date(Date.now() + options.ttlSeconds * 1000).toISOString()
      : null
    const next: StoredItem = {
      key,
      value,
      version,
      etag: `"${version}"`,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      expiresAt,
    }
    this.store.set(id, next)
    return next
  }

  async delete(scope: StorageScope, key: string, options = {}): Promise<boolean> {
    const id = this.id(scope, key)
    const current = this.store.get(id)
    if (!current) {
      return false
    }
    if (options.ifMatchVersion && current.version !== options.ifMatchVersion) {
      throw new PreconditionFailedError('If-Match mismatch')
    }
    this.store.delete(id)
    return true
  }

  async batchGet(scope: StorageScope, keys: string[]): Promise<Record<string, StoredItem | null>> {
    const out: Record<string, StoredItem | null> = {}
    for (const key of keys) {
      out[key] = await this.get(scope, key)
    }
    return out
  }

  async batchPut(
    scope: StorageScope,
    entries: BatchPutEntry[]
  ): Promise<Record<string, StoredItem>> {
    const out: Record<string, StoredItem> = {}
    for (const entry of entries) {
      out[entry.key] = await this.put(scope, entry.key, entry.value, entry)
    }
    return out
  }

  async list(scope: StorageScope): Promise<{ items: StoredItem[]; nextCursor: string | null }> {
    const values = [...this.store.entries()]
      .filter(([id]) => id.startsWith(`${scope.tenantId}:${scope.namespace}:${scope.userId}:`))
      .map(([, value]) => value)
    return { items: values, nextCursor: null }
  }

  async health(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  private id(scope: StorageScope, key: string): string {
    return `${scope.tenantId}:${scope.namespace}:${scope.userId}:${key}`
  }
}

const scope: StorageScope = {
  tenantId: 'default',
  namespace: 'ns',
  userId: 'u1',
}

describe('StorageService', () => {
  it('enforces key length and value size limits', async () => {
    const service = new StorageService(new MemoryAdapter(), {
      maxKeyLength: 5,
      maxValueBytes: 10,
    })

    await expect(service.setItem(scope, '123456', 'value')).rejects.toBeInstanceOf(ValidationError)
    await expect(service.setItem(scope, 'short', '12345678901')).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it('supports ETag preconditions', async () => {
    const service = new StorageService(new MemoryAdapter())
    const created = await service.setItem(scope, 'theme', { dark: true })

    await expect(
      service.setItem(scope, 'theme', { dark: false }, { ifMatch: '"999"' })
    ).rejects.toBeInstanceOf(PreconditionFailedError)

    const updated = await service.setItem(
      scope,
      'theme',
      { dark: false },
      { ifMatch: created.etag }
    )
    expect(updated.version).toBe(2)
  })

  it('handles batch operations', async () => {
    const service = new StorageService(new MemoryAdapter())

    await service.batchPut(scope, [
      { key: 'a', value: 1 },
      { key: 'b', value: 2 },
    ])

    const values = await service.batchGet(scope, ['a', 'b', 'c'])
    expect(values.a?.value).toBe(1)
    expect(values.b?.value).toBe(2)
    expect(values.c).toBeNull()
  })
})

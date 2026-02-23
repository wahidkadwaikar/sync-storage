import { describe, expect, it } from 'vitest'
import {
  StorageService,
  type BatchPutEntry,
  type StorageAdapter,
  type StorageScope,
  type StoredItem,
} from '@sync-storage/core'
import { createApp } from '../src/app.js'
import type { AppConfig } from '../src/config.js'

class MemoryAdapter implements StorageAdapter {
  private readonly data = new Map<string, StoredItem>()

  async get(scope: StorageScope, key: string): Promise<StoredItem | null> {
    return this.data.get(this.id(scope, key)) ?? null
  }

  async put(scope: StorageScope, key: string, value: any, options: any = {}): Promise<StoredItem> {
    const current = await this.get(scope, key)
    const version = current ? current.version + 1 : 1
    const now = new Date().toISOString()
    const item: StoredItem = {
      key,
      value,
      version,
      etag: `"${version}"`,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      expiresAt: options.ttlSeconds
        ? new Date(Date.now() + options.ttlSeconds * 1000).toISOString()
        : null,
    }
    this.data.set(this.id(scope, key), item)
    return item
  }

  async delete(scope: StorageScope, key: string): Promise<boolean> {
    return this.data.delete(this.id(scope, key))
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
    const items = [...this.data.entries()]
      .filter(([id]) => id.startsWith(`${scope.tenantId}:${scope.namespace}:${scope.userId}:`))
      .map(([, item]) => item)
    return { items, nextCursor: null }
  }

  async health(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  private id(scope: StorageScope, key: string): string {
    return `${scope.tenantId}:${scope.namespace}:${scope.userId}:${key}`
  }
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'development',
    port: 4000,
    defaultNamespace: 'default',
    defaultTenantId: 'default',
    maxBatchSize: 100,
    maxKeyLength: 255,
    maxListLimit: 100,
    maxValueBytes: 1024 * 1024,
    storageDriver: 'sqlite',
    adapterConfig: {
      driver: 'sqlite',
      sqlite: { filePath: ':memory:' },
    },
    ...overrides,
  }
}

describe('API app', () => {
  it('supports static token auth', async () => {
    const adapter = new MemoryAdapter()
    const app = createApp({
      config: createConfig({ authToken: 'test-token' }),
      service: new StorageService(adapter),
    })

    const put = await app.request('/v1/items/foo', {
      method: 'PUT',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ok: true }),
    })

    expect(put.status).toBe(200)

    const get = await app.request('/v1/items/foo', {
      method: 'GET',
      headers: {
        authorization: 'Bearer test-token',
      },
    })

    expect(get.status).toBe(200)
    expect(await get.json()).toEqual({ ok: true })
  })

  it('rejects invalid token', async () => {
    const adapter = new MemoryAdapter()
    const app = createApp({
      config: createConfig({ authToken: 'test-token' }),
      service: new StorageService(adapter),
    })

    const response = await app.request('/v1/items/foo', {
      method: 'GET',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    })

    expect(response.status).toBe(401)
  })

  it('works without auth if authToken is not configured', async () => {
    const adapter = new MemoryAdapter()
    const app = createApp({
      config: createConfig({ authToken: undefined }),
      service: new StorageService(adapter),
    })

    const response = await app.request('/v1/items/foo', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ok: true }),
    })

    expect(response.status).toBe(200)
  })

  it('uses x-user-id header to separate data', async () => {
    const adapter = new MemoryAdapter()
    const app = createApp({
      config: createConfig(),
      service: new StorageService(adapter),
    })

    // Put for user-1
    await app.request('/v1/items/foo', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-1' },
      body: JSON.stringify({ user: 1 }),
    })

    // Put for user-2
    await app.request('/v1/items/foo', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-user-id': 'user-2' },
      body: JSON.stringify({ user: 2 }),
    })

    // Get as user-1
    const res1 = await app.request('/v1/items/foo', {
      headers: { 'x-user-id': 'user-1' },
    })
    expect(await res1.json()).toEqual({ user: 1 })

    // Get as user-2
    const res2 = await app.request('/v1/items/foo', {
      headers: { 'x-user-id': 'user-2' },
    })
    expect(await res2.json()).toEqual({ user: 2 })
  })
})

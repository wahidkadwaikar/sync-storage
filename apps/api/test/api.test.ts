import jwt from 'jsonwebtoken'
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

const { sign } = jwt

class MemoryAdapter implements StorageAdapter {
  private readonly data = new Map<string, StoredItem>()

  async get(scope: StorageScope, key: string): Promise<StoredItem | null> {
    return this.data.get(this.id(scope, key)) ?? null
  }

  async put(scope: StorageScope, key: string, value: any, options = {}): Promise<StoredItem> {
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
    authMode: 'none',
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
  it('requires x-user-id in AUTH_MODE=none', async () => {
    const adapter = new MemoryAdapter()
    const app = createApp({
      config: createConfig(),
      service: new StorageService(adapter),
    })

    const response = await app.request('/v1/items/foo', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-namespace': 'default',
      },
      body: JSON.stringify({ ok: true }),
    })

    expect(response.status).toBe(400)
  })

  it('supports jwt auth mode with sub claim', async () => {
    const adapter = new MemoryAdapter()
    const app = createApp({
      config: createConfig({ authMode: 'jwt', jwtSecret: 'secret' }),
      service: new StorageService(adapter),
    })

    const token = sign({ sub: 'user-1', tenant_id: 'tenant-a' }, 'secret')

    const put = await app.request('/v1/items/foo', {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-namespace': 'default',
      },
      body: JSON.stringify({ ok: true }),
    })

    expect(put.status).toBe(200)

    const get = await app.request('/v1/items/foo', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        'x-namespace': 'default',
      },
    })

    expect(get.status).toBe(200)
    expect(await get.json()).toEqual({ ok: true })
  })
})

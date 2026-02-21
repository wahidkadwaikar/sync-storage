import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteAdapter, type StorageScope } from '../src/index.js'

const filesToCleanup: string[] = []

afterEach(() => {
  for (const file of filesToCleanup.splice(0)) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true })
    }
  }
})

function createTempSqlitePath(): string {
  const filePath = path.join(os.tmpdir(), `sync-storage-${randomUUID()}.sqlite`)
  filesToCleanup.push(filePath)
  return filePath
}

const scope: StorageScope = {
  tenantId: 'default',
  namespace: 'ns',
  userId: 'user-1',
}

describe('SqliteStorageAdapter contract', () => {
  it('supports CRUD, optimistic concurrency, and list pagination', async () => {
    const adapter = createSqliteAdapter({ filePath: createTempSqlitePath() })

    const created = await adapter.put(scope, 'alpha', { enabled: true })
    expect(created.version).toBe(1)

    const fetched = await adapter.get(scope, 'alpha')
    expect(fetched?.value).toEqual({ enabled: true })

    await expect(
      adapter.put(scope, 'alpha', { enabled: false }, { ifMatchVersion: 999 })
    ).rejects.toThrow()

    const updated = await adapter.put(
      scope,
      'alpha',
      { enabled: false },
      { ifMatchVersion: created.version }
    )
    expect(updated.version).toBe(2)

    await adapter.put(scope, 'beta', { enabled: true })
    await adapter.put(scope, 'gamma', { enabled: true })

    const page1 = await adapter.list(scope, { limit: 2 })
    expect(page1.items.length).toBe(2)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = await adapter.list(scope, { limit: 2, cursor: page1.nextCursor ?? undefined })
    expect(page2.items.length).toBeGreaterThanOrEqual(1)

    const deleted = await adapter.delete(scope, 'alpha', { ifMatchVersion: updated.version })
    expect(deleted).toBe(true)

    const afterDelete = await adapter.get(scope, 'alpha')
    expect(afterDelete).toBeNull()

    await adapter.close?.()
  })

  it('expires values with ttl', async () => {
    const adapter = createSqliteAdapter({ filePath: createTempSqlitePath() })
    await adapter.put(scope, 'ephemeral', { ok: true }, { ttlSeconds: 1 })

    await new Promise((resolve) => setTimeout(resolve, 1100))

    const value = await adapter.get(scope, 'ephemeral')
    expect(value).toBeNull()

    await adapter.close?.()
  })
})

import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createPostgresAdapter,
  createRedisAdapter,
  createTursoAdapter,
  type StorageAdapter,
  type StorageScope,
} from '../src/index.js'

async function runAdapterSuite(
  name: string,
  createAdapter: () => Promise<StorageAdapter>
): Promise<void> {
  const adapter = await createAdapter()
  const scope: StorageScope = {
    tenantId: 'default',
    namespace: `contract-${name}-${randomUUID()}`,
    userId: 'contract-user',
  }

  const created = await adapter.put(scope, 'k1', { value: 1 })
  expect(created.version).toBe(1)

  const fetched = await adapter.get(scope, 'k1')
  expect(fetched?.value).toEqual({ value: 1 })

  const updated = await adapter.put(scope, 'k1', { value: 2 }, { ifMatchVersion: created.version })
  expect(updated.version).toBe(2)

  await adapter.batchPut(scope, [
    { key: 'k2', value: { value: 2 } },
    { key: 'k3', value: { value: 3 } },
  ])

  const page = await adapter.list(scope, { prefix: 'k', limit: 2 })
  expect(page.items.length).toBe(2)

  const deleted = await adapter.delete(scope, 'k1', { ifMatchVersion: updated.version })
  expect(deleted).toBe(true)

  await adapter.close?.()
}

const postgresDescribe = process.env.TEST_POSTGRES_URL ? describe : describe.skip
postgresDescribe('Postgres adapter contract', () => {
  it('passes contract scenarios', async () => {
    await runAdapterSuite('postgres', () =>
      createPostgresAdapter({ connectionString: process.env.TEST_POSTGRES_URL as string })
    )
  })
})

const tursoDescribe = process.env.TEST_TURSO_URL ? describe : describe.skip
tursoDescribe('Turso adapter contract', () => {
  it('passes contract scenarios', async () => {
    await runAdapterSuite('turso', () =>
      createTursoAdapter({
        url: process.env.TEST_TURSO_URL as string,
        authToken: process.env.TEST_TURSO_AUTH_TOKEN,
      })
    )
  })
})

const redisDescribe = process.env.TEST_REDIS_URL ? describe : describe.skip
redisDescribe('Redis adapter contract', () => {
  it('passes contract scenarios', async () => {
    await runAdapterSuite('redis', async () =>
      createRedisAdapter({
        url: process.env.TEST_REDIS_URL as string,
        password: process.env.TEST_REDIS_PASSWORD,
      })
    )
  })
})

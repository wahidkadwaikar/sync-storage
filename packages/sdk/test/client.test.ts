import { describe, expect, it, vi } from 'vitest'
import { SyncStorageClient } from '../src/index.js'

describe('SyncStorageClient', () => {
  it('sends namespace, user, and auth headers', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ etag: '"1"', version: 1 }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const client = new SyncStorageClient({
      baseUrl: 'https://example.com',
      namespace: 'default',
      userId: 'my-user-id',
      getToken: async () => 'token-123',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await client.setItem('feature', { enabled: true })

    const [url, requestInit] = fetchMock.mock.calls[0]
    expect(url).toContain('/v1/items/feature')
    const headers = requestInit.headers as Record<string, string>
    expect(headers['x-namespace']).toBe('default')
    expect(headers['x-user-id']).toBe('my-user-id')
    expect(headers.authorization).toBe('Bearer token-123')
  })

  it('maps batchGet response to plain values', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          items: {
            a: { value: 1, etag: '"1"', version: 1 },
            b: null,
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    })

    const client = new SyncStorageClient({
      baseUrl: 'https://example.com',
      namespace: 'default',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    const result = await client.batchGet<number>(['a', 'b'])
    expect(result).toEqual({ a: 1, b: null })
  })

  it('supports remote-storage style instanceId alias for namespace', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ etag: '"1"', version: 1 }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    const client = new SyncStorageClient({
      baseUrl: 'https://example.com',
      instanceId: 'my-instance',
      userId: 'my-user-id',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await client.setItem('feature', { enabled: true })
    const [, requestInit] = fetchMock.mock.calls[0]
    const headers = requestInit.headers as Record<string, string>
    expect(headers['x-namespace']).toBe('my-instance')
    expect(headers['x-user-id']).toBe('my-user-id')
  })
})

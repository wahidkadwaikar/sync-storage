import {
  ValidationError,
  normalizeIfMatch,
  type BatchPutEntry,
  type JsonValue,
} from '@sync-storage/core'
import type { Hono } from 'hono'
import type { AppRuntime, AppVariables } from '../../types.js'

export function registerItemRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runtime: AppRuntime
): void {
  app.get('/v1/items', async (c) => {
    const actor = c.get('actor')
    const list = await runtime.service.list(actor, {
      prefix: c.req.query('prefix'),
      cursor: c.req.query('cursor'),
      limit: c.req.query('limit') ? Number.parseInt(c.req.query('limit')!, 10) : undefined,
    })
    return c.json(list as any)
  })

  app.get('/v1/items/:key', async (c) => {
    const item = await runtime.service.getItem(c.get('actor'), c.req.param('key'))
    if (!item) return c.json({ code: 'NOT_FOUND', message: 'Item not found' }, 404)

    c.header('etag', item.etag)
    if (item.expiresAt) c.header('x-expires-at', item.expiresAt)
    return c.json(item.value as any)
  })

  app.put('/v1/items/:key', async (c) => {
    const value = (await c.req.json()) as JsonValue
    const item = await runtime.service.setItem(c.get('actor'), c.req.param('key'), value, {
      ttlSeconds: c.req.query('ttlSeconds')
        ? Number.parseInt(c.req.query('ttlSeconds')!, 10)
        : undefined,
      ifMatch: c.req.header('if-match'),
    })
    return c.json(item as any)
  })

  app.delete('/v1/items/:key', async (c) => {
    const deleted = await runtime.service.removeItem(c.get('actor'), c.req.param('key'), {
      ifMatch: c.req.header('if-match'),
    })
    return deleted
      ? c.body(null, 204)
      : c.json({ code: 'NOT_FOUND', message: 'Item not found' }, 404)
  })

  app.post('/v1/items:batchGet', async (c) => {
    const body = (await c.req.json()) as { keys?: string[] }
    if (!Array.isArray(body.keys)) throw new ValidationError('keys must be an array')
    const items = await runtime.service.batchGet(c.get('actor'), body.keys)
    return c.json({ items } as any)
  })

  app.post('/v1/items:batchPut', async (c) => {
    const body = (await c.req.json()) as { entries?: any[] }
    if (!Array.isArray(body.entries)) throw new ValidationError('entries must be an array')

    const entries: BatchPutEntry[] = body.entries.map((e) => ({
      key: e.key,
      value: e.value,
      ttlSeconds: e.ttlSeconds,
      ifMatchVersion: e.ifMatch ? normalizeIfMatch(e.ifMatch) : null,
    }))

    const items = await runtime.service.batchPut(c.get('actor'), entries)
    return c.json({ items } as any)
  })
}

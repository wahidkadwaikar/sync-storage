import {
  type JsonValue,
  PreconditionFailedError,
  ValidationError,
  normalizeIfMatch,
  type BatchPutEntry,
} from '@sync-storage/core'
import type { Hono } from 'hono'
import { readJsonBody } from '../body.js'
import type { AppRuntime, AppVariables } from '../../types.js'

export function registerItemRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runtime: AppRuntime
): void {
  app.put('/v1/items/:key', async (c) => {
    const actor = c.get('actor')
    const key = c.req.param('key')
    const ifMatch = c.req.header('if-match')
    const ttlParam = c.req.query('ttlSeconds')
    const ttlSeconds = ttlParam !== undefined ? Number.parseInt(ttlParam, 10) : undefined

    const rawValue = await readJsonBody(c.req.raw)
    const value = toJsonValue(rawValue, 'request body')
    const item = await runtime.service.setItem(actor, key, value, {
      ttlSeconds,
      ifMatch,
    })

    return c.json(
      {
        key: item.key,
        etag: item.etag,
        version: item.version,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      200
    )
  })

  app.get('/v1/items/:key', async (c) => {
    const actor = c.get('actor')
    const key = c.req.param('key')
    const item = await runtime.service.getItem(actor, key)

    if (!item) {
      return c.json(
        {
          code: 'NOT_FOUND',
          message: 'Item not found',
        },
        404
      )
    }

    c.header('etag', item.etag)
    if (item.expiresAt) {
      c.header('x-expires-at', item.expiresAt)
    }

    return c.body(JSON.stringify(item.value), 200, {
      'content-type': 'application/json',
    })
  })

  app.delete('/v1/items/:key', async (c) => {
    const actor = c.get('actor')
    const key = c.req.param('key')
    const ifMatch = c.req.header('if-match')
    const deleted = await runtime.service.removeItem(actor, key, { ifMatch })

    if (!deleted) {
      return c.json(
        {
          code: 'NOT_FOUND',
          message: 'Item not found',
        },
        404
      )
    }

    return c.body(null, 204)
  })

  app.post('/v1/items:batchGet', async (c) => {
    const actor = c.get('actor')
    const body = (await readJsonBody(c.req.raw)) as { keys?: string[] }

    if (!Array.isArray(body.keys)) {
      throw new ValidationError('keys must be an array')
    }

    const items = await runtime.service.batchGet(actor, body.keys)

    return c.json({
      items: Object.fromEntries(
        Object.entries(items).map(([key, item]) => [
          key,
          item
            ? {
                value: item.value,
                etag: item.etag,
                version: item.version,
                expiresAt: item.expiresAt,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
              }
            : null,
        ])
      ),
    })
  })

  app.post('/v1/items:batchPut', async (c) => {
    const actor = c.get('actor')
    const body = (await readJsonBody(c.req.raw)) as {
      entries?: Array<{ key?: string; value?: unknown; ttlSeconds?: number; ifMatch?: string }>
    }

    if (!Array.isArray(body.entries)) {
      throw new ValidationError('entries must be an array')
    }

    const entries: BatchPutEntry[] = body.entries.map((entry) => {
      if (!entry.key) {
        throw new ValidationError('entry.key is required')
      }

      const parsedIfMatch = entry.ifMatch ? normalizeIfMatch(entry.ifMatch) : null
      if (entry.ifMatch && !parsedIfMatch) {
        throw new PreconditionFailedError(`Invalid If-Match value for key ${entry.key}`)
      }

      return {
        key: entry.key,
        value: toJsonValue(entry.value, `entries.${entry.key}.value`),
        ttlSeconds: entry.ttlSeconds,
        ifMatchVersion: parsedIfMatch,
      }
    })

    const items = await runtime.service.batchPut(actor, entries)

    return c.json({
      items: Object.fromEntries(
        Object.entries(items).map(([key, item]) => [
          key,
          {
            etag: item.etag,
            version: item.version,
            expiresAt: item.expiresAt,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          },
        ])
      ),
    })
  })

  app.get('/v1/items', async (c) => {
    const actor = c.get('actor')
    const prefix = c.req.query('prefix')
    const cursor = c.req.query('cursor')
    const limitValue = c.req.query('limit')
    const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined

    const list = await runtime.service.list(actor, {
      prefix,
      cursor,
      limit,
    })

    return c.json(list)
  })
}

function toJsonValue(value: unknown, fieldName: string): JsonValue {
  if (!isJsonValue(value)) {
    throw new ValidationError(`${fieldName} must be a valid JSON value`)
  }

  return value
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry))
  }

  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isJsonValue(entry))
  }

  return false
}

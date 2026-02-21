import { SyncStorageError } from '@sync-storage/core'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'

export function handleApiError(error: unknown, c: Context): Response {
  if (error instanceof SyncStorageError) {
    return c.json(
      {
        code: error.code,
        message: error.message,
      },
      error.status as any
    )
  }

  if (error instanceof HTTPException) {
    return c.json(
      {
        code: 'HTTP_ERROR',
        message: error.message,
      },
      error.status as any
    )
  }

  console.error('Unhandled API error', error)
  return c.json(
    {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected internal server error',
    },
    500
  )
}

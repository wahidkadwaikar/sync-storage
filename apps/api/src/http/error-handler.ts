import { SyncStorageError } from '@sync-storage/core'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function handleApiError(error: unknown, c: Context): Response {
  if (error instanceof SyncStorageError) {
    return c.json(
      {
        code: error.code,
        message: error.message,
      },
      toStatusCode(error.status)
    )
  }

  if (error instanceof HTTPException) {
    return c.json(
      {
        code: 'HTTP_ERROR',
        message: error.message,
      },
      toStatusCode(error.status)
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

function toStatusCode(status: number): ContentfulStatusCode {
  if (status >= 200 && status <= 599 && status !== 204 && status !== 205 && status !== 304) {
    return status as ContentfulStatusCode
  }
  return 500
}

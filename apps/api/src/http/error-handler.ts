import type { Context } from 'hono'
import {
  SyncStorageError,
  ValidationError,
  UnauthorizedError,
  PreconditionFailedError,
} from '@sync-storage/core'

export function handleApiError(error: Error, c: Context): Response {
  if (error instanceof SyncStorageError) {
    const status =
      error instanceof ValidationError || error instanceof PreconditionFailedError
        ? 400
        : error instanceof UnauthorizedError
          ? 401
          : 500
    return c.json(
      {
        code: error.code,
        message: error.message,
        details: (error as any).details,
      },
      status as any
    )
  }

  console.error('Unhandled Error:', error)
  return c.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
    500
  ) as any
}

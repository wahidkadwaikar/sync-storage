import { type StorageScope, UnauthorizedError } from '@sync-storage/core'
import type { AppConfig } from '../config.js'

export function resolveActor(request: Request, config: AppConfig): StorageScope {
  const { authToken, defaultTenantId, defaultNamespace } = config

  if (authToken) {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (token !== authToken) {
      throw new UnauthorizedError('Invalid or missing authorization token')
    }
  }

  return {
    tenantId: request.headers.get('x-tenant-id') || defaultTenantId,
    namespace: request.headers.get('x-namespace') || defaultNamespace,
    userId: request.headers.get('x-user-id') || 'default',
  }
}

import jwt, { type JwtPayload } from 'jsonwebtoken'
import {
  SyncStorageError,
  UnauthorizedError,
  ValidationError,
  type StorageScope,
} from '@sync-storage/core'
import type { AppConfig } from '../config.js'

export function resolveActor(request: Request, config: AppConfig): StorageScope {
  const namespace = request.headers.get('x-namespace') || config.defaultNamespace
  if (!namespace) {
    throw new ValidationError(
      'x-namespace header is required when DEFAULT_NAMESPACE is not configured'
    )
  }

  if (config.authMode === 'none') {
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      throw new ValidationError('x-user-id header is required when AUTH_MODE=none')
    }

    const tenantId = request.headers.get('x-tenant-id') || config.defaultTenantId
    return {
      tenantId,
      namespace,
      userId,
    }
  }

  const authorizationHeader = request.headers.get('authorization')
  if (!authorizationHeader) {
    throw new UnauthorizedError('Authorization header is required')
  }

  const token = authorizationHeader.replace(/^Bearer\s+/i, '')
  if (!token || token === authorizationHeader) {
    throw new UnauthorizedError('Authorization header must use Bearer token format')
  }

  let payload: JwtPayload
  try {
    const verified = jwt.verify(token, config.jwtSecret as string)
    if (typeof verified === 'string') {
      throw new UnauthorizedError('JWT payload must be an object')
    }
    payload = verified
  } catch (error) {
    if (error instanceof SyncStorageError) {
      throw error
    }
    throw new UnauthorizedError('Invalid JWT token')
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new UnauthorizedError('JWT token must include a string sub claim')
  }

  const tenantClaim = payload.tenant_id
  const tenantId = typeof tenantClaim === 'string' ? tenantClaim : config.defaultTenantId

  return {
    tenantId,
    namespace,
    userId: payload.sub,
  }
}

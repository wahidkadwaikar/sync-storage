import { ValidationError } from '@sync-storage/core'

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      throw new ValidationError('Content-Type must be application/json')
    }
  }

  try {
    return await request.json()
  } catch {
    throw new ValidationError('Invalid JSON payload')
  }
}

export interface SyncStorageClientOptions {
  baseUrl: string
  namespace?: string
  namespaceId?: string
  instanceId?: string
  userId?: string
  getToken?: () => Promise<string | undefined> | string | undefined
  fetchImpl?: typeof fetch
}

export interface SetItemOptions {
  ttlSeconds?: number
  ifMatch?: string
}

export interface RemoveItemOptions {
  ifMatch?: string
}

export interface BatchSetEntry<T = unknown> {
  key: string
  value: T
  ttlSeconds?: number
  ifMatch?: string
}

export interface ListOptions {
  prefix?: string
  cursor?: string
  limit?: number
}

export interface ListResult<T = unknown> {
  items: Array<{
    key: string
    value: T
    etag: string
    version: number
    createdAt: string
    updatedAt: string
    expiresAt: string | null
  }>
  nextCursor: string | null
}

export class SyncStorageClient {
  private readonly baseUrl: string
  private readonly namespace: string
  private readonly userId?: string
  private readonly getToken?: SyncStorageClientOptions['getToken']
  private readonly fetchImpl: typeof fetch

  constructor(options: SyncStorageClientOptions) {
    this.baseUrl = options.baseUrl
    this.namespace = options.namespace ?? options.namespaceId ?? options.instanceId ?? 'default'
    this.userId = options.userId
    this.getToken = options.getToken
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async getItem<T = unknown>(key: string): Promise<T | null> {
    const response = await this.call('GET', `/v1/items/${encodeURIComponent(key)}`)
    if (response.status === 404) {
      return null
    }
    await this.assertOk(response)
    return (await response.json()) as T
  }

  async setItem<T = unknown>(
    key: string,
    value: T,
    options: SetItemOptions = {}
  ): Promise<{ etag: string; version: number }> {
    const query = new URLSearchParams()
    if (options.ttlSeconds !== undefined) {
      query.set('ttlSeconds', String(options.ttlSeconds))
    }

    const response = await this.call(
      'PUT',
      `/v1/items/${encodeURIComponent(key)}${query.size > 0 ? `?${query.toString()}` : ''}`,
      value,
      options.ifMatch
    )

    await this.assertOk(response)
    const body = (await response.json()) as { etag: string; version: number }
    return body
  }

  async removeItem(key: string, options: RemoveItemOptions = {}): Promise<boolean> {
    const response = await this.call(
      'DELETE',
      `/v1/items/${encodeURIComponent(key)}`,
      undefined,
      options.ifMatch
    )
    if (response.status === 404) {
      return false
    }
    await this.assertOk(response)
    return response.status === 204 || response.status === 200
  }

  async batchGet<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
    const response = await this.call('POST', '/v1/items:batchGet', { keys })
    await this.assertOk(response)
    const body = (await response.json()) as {
      items: Record<string, { value: T } | null>
    }

    const result: Record<string, T | null> = {}
    for (const [key, entry] of Object.entries(body.items)) {
      result[key] = entry ? entry.value : null
    }
    return result
  }

  async batchSet<T = unknown>(
    entries: BatchSetEntry<T>[]
  ): Promise<Record<string, { etag: string; version: number }>> {
    const response = await this.call('POST', '/v1/items:batchPut', { entries })
    await this.assertOk(response)
    const body = (await response.json()) as {
      items: Record<string, { etag: string; version: number }>
    }

    return body.items
  }

  async list<T = unknown>(options: ListOptions = {}): Promise<ListResult<T>> {
    const query = new URLSearchParams()
    if (options.prefix) {
      query.set('prefix', options.prefix)
    }
    if (options.cursor) {
      query.set('cursor', options.cursor)
    }
    if (options.limit !== undefined) {
      query.set('limit', String(options.limit))
    }

    const response = await this.call(
      'GET',
      `/v1/items${query.size > 0 ? `?${query.toString()}` : ''}`
    )
    await this.assertOk(response)
    return (await response.json()) as ListResult<T>
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
    ifMatch?: string
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-namespace': this.namespace,
    }
    if (this.userId) {
      headers['x-user-id'] = this.userId
    }

    const token = await this.getToken?.()
    if (token) {
      headers.authorization = `Bearer ${token}`
    }
    if (ifMatch) {
      headers['if-match'] = ifMatch
    }

    return this.fetchImpl(new URL(path, this.baseUrl).toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  private async assertOk(response: Response): Promise<void> {
    if (response.ok) {
      return
    }

    let message = `Request failed with status ${response.status}`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload.message) {
        message = payload.message
      }
    } catch {
      // Ignore JSON parsing issues for non-JSON errors.
    }

    throw new Error(message)
  }
}

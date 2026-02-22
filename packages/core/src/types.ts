export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface StorageScope {
  tenantId: string
  namespace: string
  userId: string
}

export interface StoredItem {
  key: string
  value: JsonValue
  version: number
  etag: string
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

export interface ListResult {
  items: StoredItem[]
  nextCursor: string | null
}

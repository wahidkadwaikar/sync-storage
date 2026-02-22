import type { JsonValue, ListResult, StorageScope, StoredItem } from '../types.js'

export interface PutOptions {
  ttlSeconds?: number
  ifMatchVersion?: number | null
}

export interface DeleteOptions {
  ifMatchVersion?: number | null
}

export interface ListOptions {
  prefix?: string
  cursor?: string | null
  limit?: number
}

export interface BatchPutEntry {
  key: string
  value: JsonValue
  ttlSeconds?: number
  ifMatchVersion?: number | null
}

export interface StorageAdapter {
  get(scope: StorageScope, key: string): Promise<StoredItem | null>
  put(scope: StorageScope, key: string, value: JsonValue, options?: PutOptions): Promise<StoredItem>
  delete(scope: StorageScope, key: string, options?: DeleteOptions): Promise<boolean>
  batchGet(scope: StorageScope, keys: string[]): Promise<Record<string, StoredItem | null>>
  batchPut(scope: StorageScope, entries: BatchPutEntry[]): Promise<Record<string, StoredItem>>
  list(scope: StorageScope, options?: ListOptions): Promise<ListResult>
  health(): Promise<{ ok: boolean; details?: string }>
  close?(): Promise<void>
}

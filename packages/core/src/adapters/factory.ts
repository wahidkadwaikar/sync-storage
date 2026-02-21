import type { StorageAdapter } from './types.js'
import { createPostgresAdapter, type PostgresAdapterOptions } from './postgres.js'
import { createRedisAdapter, type RedisAdapterOptions } from './redis.js'
import { createSqliteAdapter, type SqliteAdapterOptions } from './sqlite.js'
import { createTursoAdapter, type TursoAdapterOptions } from './turso.js'

export type StorageDriver = 'sqlite' | 'turso' | 'postgres' | 'redis'

export interface AdapterFactoryConfig {
  driver: StorageDriver
  sqlite?: SqliteAdapterOptions
  turso?: TursoAdapterOptions
  postgres?: PostgresAdapterOptions
  redis?: RedisAdapterOptions
}

export async function createAdapterFromConfig(
  config: AdapterFactoryConfig
): Promise<StorageAdapter> {
  switch (config.driver) {
    case 'sqlite':
      if (!config.sqlite) {
        throw new Error('sqlite config is required')
      }
      return createSqliteAdapter(config.sqlite)
    case 'turso':
      if (!config.turso) {
        throw new Error('turso config is required')
      }
      return createTursoAdapter(config.turso)
    case 'postgres':
      if (!config.postgres) {
        throw new Error('postgres config is required')
      }
      return createPostgresAdapter(config.postgres)
    case 'redis':
      if (!config.redis) {
        throw new Error('redis config is required')
      }
      return createRedisAdapter(config.redis)
    default:
      throw new Error(`Unsupported storage driver: ${(config as AdapterFactoryConfig).driver}`)
  }
}

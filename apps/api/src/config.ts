import { z } from 'zod'
import type { AdapterFactoryConfig, StorageDriver } from '@sync-storage/core'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  AUTH_MODE: z.enum(['jwt', 'none']).optional(),
  JWT_SECRET: z.string().optional(),
  DEFAULT_NAMESPACE: z.string().optional(),
  DEFAULT_TENANT_ID: z.string().default('default'),
  STORAGE_DRIVER: z.enum(['sqlite', 'turso', 'postgres', 'redis']).default('sqlite'),
  SQLITE_FILE_PATH: z.string().default('./data/sync-storage.sqlite'),
  TURSO_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().optional(),
  MAX_KEY_LENGTH: z.coerce.number().int().positive().default(255),
  MAX_VALUE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 * 1024),
  MAX_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  MAX_LIST_LIMIT: z.coerce.number().int().positive().default(100),
})

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  authMode: 'jwt' | 'none'
  jwtSecret?: string
  defaultNamespace?: string
  defaultTenantId: string
  maxKeyLength: number
  maxValueBytes: number
  maxBatchSize: number
  maxListLimit: number
  storageDriver: StorageDriver
  adapterConfig: AdapterFactoryConfig
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.parse(env)
  const authMode = parsed.AUTH_MODE ?? (parsed.NODE_ENV === 'production' ? 'jwt' : 'none')

  if (authMode === 'jwt' && !parsed.JWT_SECRET) {
    throw new Error('JWT_SECRET is required when AUTH_MODE is jwt')
  }

  const adapterConfig = buildAdapterConfig(parsed.STORAGE_DRIVER, parsed)

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    authMode,
    jwtSecret: parsed.JWT_SECRET,
    defaultNamespace: parsed.DEFAULT_NAMESPACE,
    defaultTenantId: parsed.DEFAULT_TENANT_ID,
    maxKeyLength: parsed.MAX_KEY_LENGTH,
    maxValueBytes: parsed.MAX_VALUE_BYTES,
    maxBatchSize: parsed.MAX_BATCH_SIZE,
    maxListLimit: parsed.MAX_LIST_LIMIT,
    storageDriver: parsed.STORAGE_DRIVER,
    adapterConfig,
  }
}

function buildAdapterConfig(
  driver: StorageDriver,
  parsed: z.infer<typeof envSchema>
): AdapterFactoryConfig {
  switch (driver) {
    case 'sqlite':
      return {
        driver,
        sqlite: {
          filePath: parsed.SQLITE_FILE_PATH,
        },
      }
    case 'turso':
      if (!parsed.TURSO_URL) {
        throw new Error('TURSO_URL is required for turso driver')
      }
      return {
        driver,
        turso: {
          url: parsed.TURSO_URL,
          authToken: parsed.TURSO_AUTH_TOKEN,
        },
      }
    case 'postgres':
      if (!parsed.POSTGRES_URL) {
        throw new Error('POSTGRES_URL is required for postgres driver')
      }
      return {
        driver,
        postgres: {
          connectionString: parsed.POSTGRES_URL,
        },
      }
    case 'redis':
      if (!parsed.REDIS_URL) {
        throw new Error('REDIS_URL is required for redis driver')
      }
      return {
        driver,
        redis: {
          url: parsed.REDIS_URL,
          password: parsed.REDIS_PASSWORD,
          database: parsed.REDIS_DB,
        },
      }
    default:
      throw new Error(`Unsupported storage driver ${driver}`)
  }
}

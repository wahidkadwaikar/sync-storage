import { serve } from '@hono/node-server'
import dotenv from 'dotenv'
import { createAdapterFromConfig, StorageService } from '@sync-storage/core'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

dotenv.config()

const config = loadConfig(process.env)
const adapter = await createAdapterFromConfig(config.adapterConfig)
const service = new StorageService(adapter, {
  maxBatchSize: config.maxBatchSize,
  maxKeyLength: config.maxKeyLength,
  maxListLimit: config.maxListLimit,
  maxValueBytes: config.maxValueBytes,
})

const app = createApp({
  config,
  service,
})

const server = serve({
  fetch: app.fetch,
  port: config.port,
})

console.log(`Sync Storage API listening on port ${config.port} with driver ${config.storageDriver}`)

const shutdown = async () => {
  try {
    await adapter.close?.()
  } finally {
    server.close()
    process.exit(0)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

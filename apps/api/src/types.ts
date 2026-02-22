import type { StorageScope, StorageService } from '@sync-storage/core'
import type { AppConfig } from './config.js'

export interface AppVariables {
  actor: StorageScope
}

export interface AppRuntime {
  config: AppConfig
  service: StorageService
}

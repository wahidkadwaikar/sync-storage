import { spawnSync } from 'node:child_process'

const requiredBaseEnv = ['FLY_APP_NAME', 'STORAGE_DRIVER', 'JWT_SECRET']

const driverRequirements = {
  sqlite: ['SQLITE_FILE_PATH'],
  turso: ['TURSO_URL'],
  postgres: ['POSTGRES_URL'],
  redis: ['REDIS_URL'],
}

const missing = requiredBaseEnv.filter((key) => !process.env[key])
const driver = process.env.STORAGE_DRIVER
if (!driver || !(driver in driverRequirements)) {
  console.error('STORAGE_DRIVER must be one of sqlite|turso|postgres|redis')
  process.exit(1)
}

for (const key of driverRequirements[driver]) {
  if (!process.env[key]) {
    missing.push(key)
  }
}

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const appName = process.env.FLY_APP_NAME
const flyOrg = process.env.FLY_ORG

const createArgs = ['apps', 'create', appName]
if (flyOrg) {
  createArgs.push('--org', flyOrg)
}
const createApp = spawnSync('flyctl', createArgs, { stdio: 'inherit' })
if (createApp.status !== 0) {
  console.warn('flyctl apps create returned non-zero; continuing (app may already exist).')
}

const secretKeys = [
  'NODE_ENV',
  'PORT',
  'AUTH_MODE',
  'JWT_SECRET',
  'DEFAULT_NAMESPACE',
  'DEFAULT_TENANT_ID',
  'STORAGE_DRIVER',
  'SQLITE_FILE_PATH',
  'TURSO_URL',
  'TURSO_AUTH_TOKEN',
  'POSTGRES_URL',
  'REDIS_URL',
  'REDIS_PASSWORD',
  'REDIS_DB',
]

const secrets = secretKeys
  .filter((key) => process.env[key] !== undefined && process.env[key] !== '')
  .map((key) => `${key}=${process.env[key]}`)

if (secrets.length > 0) {
  const secretResult = spawnSync('flyctl', ['secrets', 'set', '-a', appName, ...secrets], {
    stdio: 'inherit',
  })
  if (secretResult.status !== 0) {
    process.exit(secretResult.status ?? 1)
  }
}

const deploy = spawnSync('flyctl', ['deploy', '-a', appName, '-c', 'deploy/fly/fly.toml'], {
  stdio: 'inherit',
})
process.exit(deploy.status ?? 1)

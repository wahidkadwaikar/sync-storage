# sync-storage

sync-storage is a remote JSON key-value storage layer for product state that should persist across browsers and devices.

It keeps the mental model simple, while adding production controls that local storage does not provide: auth, concurrency control, TTL, batch APIs, and pluggable backends.

## Why

`localStorage` is fast and convenient, but it is device-local. State such as onboarding progress, UI preferences, and dismissals can drift or reset when users switch devices or browsers.

sync-storage provides a small remote storage API for non-sensitive app state so UX remains consistent across sessions and devices.

## Why teams pick this

- Minimal JSON key-value API (`PUT/GET/DELETE`) with versioned routes (`/v1`)
- Simple token-based production auth model (`AUTH_TOKEN`)
- Optimistic concurrency with `ETag` + `If-Match`
- Optional item TTL (`ttlSeconds`)
- Batch read/write operations (`items:batchGet`, `items:batchPut`)
- Prefix listing with cursor pagination (`GET /v1/items`)
- Pluggable storage drivers: `SQLite`, `Turso`, `Postgres`, `Redis`
- Fast deployment path: Fly template + Railway template + `pnpm deploy:fly`

## Quick start

```bash
pnpm install
cp apps/api/.env.example .env
pnpm dev
```

API runs at `http://localhost:4000`.

## SDK example

```ts
import { SyncStorageClient } from '@sync-storage/sdk'

const client = new SyncStorageClient({
  baseUrl: 'http://localhost:4000',
  namespace: 'default',
  userId: 'my-user-id', // sent as x-user-id
  getToken: async () => process.env.AUTH_TOKEN, // static token
})

await client.setItem('hasSeenWelcome', true)
const seen = await client.getItem<boolean>('hasSeenWelcome')
```

## Feature flag example

```ts
import { SyncStorageClient } from '@sync-storage/sdk'

const storage = new SyncStorageClient({
  baseUrl: 'http://localhost:4000',
  instanceId: 'my-app', // alias for namespace
  userId: 'my-user-id',
  getToken: async () => 'your-fixed-token',
})

const hasSeenNewFeature = await storage.getItem<boolean>('hasSeenNewFeature')

if (!hasSeenNewFeature) {
  await storage.setItem('hasSeenNewFeature', true)
  // Highlight your new and exciting feature!
}
```

If `AUTH_TOKEN` is configured on the backend, passing `getToken` in the SDK is required.

## API example

Send `x-user-id` and `x-namespace` headers.

```bash
curl -i -X PUT \
  -H "content-type: application/json" \
  -H "authorization: Bearer your-token" \
  -H "x-namespace: default" \
  -H "x-user-id: user-123" \
  -d '{"foo":"bar"}' \
  "http://localhost:4000/v1/items/my-key"

curl -i -X GET \
  -H "authorization: Bearer your-token" \
  -H "x-namespace: default" \
  -H "x-user-id: user-123" \
  "http://localhost:4000/v1/items/my-key"
```

## API surface

- `GET /v1/healthz`
- `GET /v1/readyz`
- `PUT /v1/items/:key`
- `GET /v1/items/:key`
- `DELETE /v1/items/:key`
- `POST /v1/items:batchGet`
- `POST /v1/items:batchPut`
- `GET /v1/items?prefix=&cursor=&limit=`

## Auth model

- Production auth: `AUTH_TOKEN`
  - If set, requires `Authorization: Bearer <token>` to match exactly.
  - If unset, auth is disabled (local/dev).
- Headers:
  - `x-user-id`: Identifies the user (defaults to `default`).
  - `x-tenant-id`: Optional tenant grouping (defaults to `default`).
  - `x-namespace`: Required grouping for items (defaults to `default`).

## Storage drivers

- `sqlite`
- `turso`
- `postgres`
- `redis`

Driver-specific env vars are documented in `/Users/wahid/Developer/sync-storage/deploy/README.md`.

## Deploy quickly

- Fly template: `/sync-storage/deploy/fly/fly.toml`
- Railway template: `/sync-storage/deploy/railway/railway.json`
- Fly launch button: [Launch on Fly](https://fly.io/launch?repo=https://github.com/your-org/sync-storage)
- Railway launch button: [Deploy on Railway](https://railway.com/new/template?repo=https://github.com/your-org/sync-storage)

Fly deploy command:

```bash
export FLY_APP_NAME=my-sync-storage
export STORAGE_DRIVER=postgres
export POSTGRES_URL=postgres://...
export AUTH_TOKEN=...
pnpm deploy:fly
```

## Quality checks

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm -r build
```

## FAQ

### What should I store here?

Non-sensitive product state: preferences, onboarding state, dismissals, and lightweight feature metadata.

Do not store secrets, credentials, or highly sensitive PII.

### Is there a hosted community server?

Not currently. This repository is self-host oriented.

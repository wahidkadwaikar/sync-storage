# Deployment

## One-click templates

- Fly: `deploy/fly/fly.toml`
- Railway: `deploy/railway/railway.json`

## Required env vars (all deployments)

- `STORAGE_DRIVER` (`sqlite` | `turso` | `postgres` | `redis`)
- `JWT_SECRET`
- `DEFAULT_NAMESPACE` (optional, but required for clients that do not send `x-namespace`)
- `DEFAULT_TENANT_ID` (defaults to `default`)

## Driver-specific env vars

### sqlite

- `SQLITE_FILE_PATH` (example: `/data/sync-storage.sqlite`)

### turso

- `TURSO_URL`
- `TURSO_AUTH_TOKEN` (optional if your Turso endpoint allows tokenless auth)

### postgres

- `POSTGRES_URL`

### redis

- `REDIS_URL`
- `REDIS_PASSWORD` (optional)
- `REDIS_DB` (optional)

## Fly deploy

```bash
export FLY_APP_NAME=my-sync-storage
export STORAGE_DRIVER=postgres
export POSTGRES_URL=postgresql://...
export JWT_SECRET=...
export DEFAULT_NAMESPACE=default
pnpm deploy:fly
```

## Railway deploy

1. Import this repo in Railway.
2. Ensure Railway uses `apps/api/Dockerfile`.
3. Set required environment variables from the matrix above.
4. Verify health checks at `/v1/healthz` and `/v1/readyz`.

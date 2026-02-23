import type { Hono } from 'hono'
import type { AppRuntime, AppVariables } from '../../types.js'

export function registerHealthRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runtime: AppRuntime
): void {
  app.get('/v1/healthz', (c) => c.json({ ok: true }))
  app.get('/v1/readyz', async (c) => {
    const health = await runtime.service.health()
    return c.json(health, health.ok ? 200 : (503 as any))
  })
}

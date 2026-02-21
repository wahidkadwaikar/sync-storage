import type { Hono } from 'hono'
import type { AppRuntime, AppVariables } from '../../types.js'

export function registerHealthRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runtime: AppRuntime
): void {
  app.get('/v1/healthz', (c) => {
    return c.json({ ok: true })
  })

  app.get('/v1/readyz', async (c) => {
    const health = await runtime.service.health()
    const status = health.ok ? 200 : 503
    return c.json(health, status as any)
  })
}

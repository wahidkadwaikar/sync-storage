import type { Hono } from 'hono'
import { resolveActor } from '../../auth/resolve-actor.js'
import type { AppRuntime, AppVariables } from '../../types.js'

export function registerActorMiddleware(
  app: Hono<{ Variables: AppVariables }>,
  runtime: AppRuntime
): void {
  app.use('/v1/*', async (c, next) => {
    if (c.req.path === '/v1/healthz' || c.req.path === '/v1/readyz') {
      await next()
      return
    }

    const actor = resolveActor(c.req.raw, runtime.config)
    c.set('actor', actor)
    await next()
  })
}

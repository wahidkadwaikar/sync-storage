import { Hono } from 'hono'
import { handleApiError } from './http/error-handler.js'
import { registerActorMiddleware } from './http/middleware/actor-middleware.js'
import { registerHealthRoutes } from './http/routes/health-routes.js'
import { registerItemRoutes } from './http/routes/items-routes.js'
import type { AppRuntime, AppVariables } from './types.js'

export type { AppRuntime }

export function createApp(runtime: AppRuntime): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>()

  app.onError((error, c) => handleApiError(error, c))

  registerActorMiddleware(app, runtime)
  registerHealthRoutes(app, runtime)
  registerItemRoutes(app, runtime)

  return app
}

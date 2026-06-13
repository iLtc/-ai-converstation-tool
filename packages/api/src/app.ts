import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError, ValidationError, ProviderError, NeedsManualSelectionError } from './errors.js';
import { DEFAULT_USER_ID } from './config.js';
import type { DB } from './db/client.js';
import type { ProviderFactory } from './providers/registry.js';
import { resolveProviderModel } from './providers/registry.js';
import { conversationRoutes } from './routes/conversations.js';
import { messageRoutes } from './routes/messages.js';
import { draftSessionRoutes } from './routes/draftSessions.js';
import { styleProfileRoutes } from './routes/styleProfiles.js';

export interface AppDeps {
  db: DB;
  providerFactory: ProviderFactory;
  defaults: { provider: string; model: string };
  userId?: string; // overridable in tests; defaults to DEFAULT_USER_ID
}

export type AppContext = {
  Variables: { userId: string; deps: AppDeps };
};

export function createApp(deps: AppDeps): Hono<AppContext> {
  const app = new Hono<AppContext>();

  app.use('*', async (c, next) => {
    c.set('userId', deps.userId ?? DEFAULT_USER_ID);
    c.set('deps', deps);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      const extra: Record<string, unknown> = {};
      if (err instanceof ValidationError) extra.details = err.details;
      if (err instanceof ProviderError) extra.retryable = err.retryable;
      if (err instanceof NeedsManualSelectionError) extra.sessionIds = err.sessionIds;
      return c.json({ error: { code: err.code, message: err.message, ...extra } }, err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/conversations', conversationRoutes());
  app.route('/', messageRoutes());
  app.route('/', draftSessionRoutes());
  app.route('/style-profiles', styleProfileRoutes());

  return app;
}

/** Builds DraftDeps (provider instance + defaults) for a given conversation's model. */
export function draftDepsFor(deps: AppDeps, overrides: { provider: string | null; model: string | null }) {
  const { provider } = resolveProviderModel(overrides, deps.defaults);
  return { provider: deps.providerFactory(provider), defaults: deps.defaults };
}

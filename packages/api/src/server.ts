import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { applyMigrations } from './db/migrate.js';
import { defaultProviderFactory } from './providers/registry.js';
import { config } from './config.js';

const db = createDb(config.databaseUrl);
applyMigrations(db);

const app = createApp({
  db,
  providerFactory: defaultProviderFactory,
  defaults: { provider: config.defaultProvider, model: config.defaultModel },
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

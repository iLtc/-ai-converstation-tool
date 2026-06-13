export const config = {
  defaultUserId: process.env.DEFAULT_USER_ID ?? 'local-user',
  defaultProvider: process.env.DEFAULT_PROVIDER ?? 'anthropic',
  defaultModel: process.env.DEFAULT_MODEL ?? 'claude-opus-4-8',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/app.sqlite',
  port: parseInt(process.env.PORT ?? '8787', 10) || 8787,
};

// Convenience alias used by the app factory's default user middleware.
export const DEFAULT_USER_ID = config.defaultUserId;

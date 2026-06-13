# AI Conversation Drafting Tool — Backend

## Develop

```bash
pnpm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY / OPENAI_API_KEY
cd packages/api && pnpm db:generate   # only after schema changes
pnpm --filter @app/api dev
```

API at http://localhost:8787 — `GET /health` returns `{ "ok": true }`.

## Test

```bash
pnpm test            # all packages
```

## Run with Docker

```bash
ANTHROPIC_API_KEY=... docker compose up --build
```

The SQLite database persists in the `app-data` volume. Postgres is not yet
wired — a `postgres://` `DATABASE_URL` fails loud by design.

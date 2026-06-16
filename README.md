# AI Conversation Drafting Tool

A personal tool that uses AI to help draft chat and email responses: an `@app/api`
backend (Hono + Drizzle/SQLite) and an `@app/web` React app.

## Develop

```bash
pnpm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY / OPENAI_API_KEY
cd packages/api && pnpm db:generate   # only after schema changes
pnpm --filter @app/api dev
```

API at http://localhost:8787 — `GET /health` returns `{ "ok": true }`.

## Web app

Dev (API on :8787, web on :5173 with `/api` proxied to the API):

```bash
pnpm --filter @app/api dev      # terminal 1
pnpm --filter @app/web dev      # terminal 2
# open http://localhost:5173
```

The web dev server proxies `/api/*` to the API (stripping the `/api` prefix).

## Test

```bash
pnpm test            # all packages
```

## Run with Docker

```bash
ANTHROPIC_API_KEY=... docker compose up --build
```

This builds and runs both services: the API on http://localhost:8787 and the web
app on http://localhost:8080 (the web container's nginx proxies `/api/*` to the
api service). The SQLite database persists in the `app-data` volume. Postgres is
not yet wired — a `postgres://` `DATABASE_URL` fails loud by design.

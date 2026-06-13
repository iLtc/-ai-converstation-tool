# AI Conversation Drafting Tool — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend (API server + persistence + AI provider layer + context assembly) for the AI conversation drafting tool, fully testable headless, with the React web app to follow in a separate plan.

**Architecture:** A pnpm monorepo with two packages: `@app/shared` (zod schemas shared with the future client) and `@app/api` (Hono REST API over Drizzle/SQLite). A `Provider` interface abstracts Anthropic and OpenAI behind one shape, with a forced `respond({ answers?, draft })` tool, plain-text completion for summaries, and token counting for context budgeting. Context assembly feeds curated prior-session context and degrades to summaries under a token budget via sliding compression. All dependencies (DB, provider factory) are injected so logic is unit-testable and routes are integration-testable with no network.

**Tech Stack:** TypeScript (ESM), Node 24, pnpm workspaces, Hono + @hono/node-server, Drizzle ORM + better-sqlite3, zod, @anthropic-ai/sdk, openai, gpt-tokenizer, vitest, drizzle-kit, Docker.

---

## Decisions locked in for this plan

These resolve open points from the spec so the engineer never has to guess:

- **Brief lives only as the first `draft_turn`** (`kind = 'brief'`). The `draft_sessions` table does **not** carry a duplicate `brief` column — this reconciles the redundancy flagged in the 2026-06-13 spec review. The ordered drafting history is the single source of truth.
- **Provider interface has three methods:** `complete()` (forced `respond` tool), `completeText()` (plain prose, used for summaries), `countTokens()`. `completeText` is what generates the on-send summary using the conversation's selected model.
- **The AI request is a single user message.** Each AI round is a stateless re-send: the server composes one user-message string (system prompt is separate). Revision rounds pass the current draft explicitly inside that string. This matches the spec's "stateless re-sends" and makes token counting and compression operate on one assembled blob.
- **OpenAI token counting is local** (`gpt-tokenizer`); Anthropic uses its real `countTokens` API. The spec already permits a local heuristic for `countTokens`; OpenAI has no count endpoint, so local tokenization is the faithful choice. Both satisfy the same `countTokens(): Promise<number>` contract.
- **SQLite now; Postgres seam only.** `createDb()` switches on `DATABASE_URL`; a `postgres*` URL throws a clear "not yet implemented" error. The Drizzle schema stays in one file so a pg variant is an additive change later (per spec's deferred Postgres-ready note).
- **`DEFAULT_USER_ID`** is a single constant; no header trust is built (spec deferral).

## File Structure

```
package.json                      # root workspace, scripts
pnpm-workspace.yaml
tsconfig.base.json
.gitignore
.env.example
docker-compose.yml
packages/
  shared/
    package.json
    tsconfig.json
    src/
      schemas.ts                  # zod enums, content shapes, RespondOutput, API DTOs
      index.ts
      schemas.test.ts
  api/
    package.json
    tsconfig.json
    vitest.config.ts
    drizzle.config.ts
    Dockerfile
    drizzle/                      # generated migrations
    src/
      config.ts                   # env: DEFAULT_USER_ID, default provider/model, port
      errors.ts                   # typed domain errors
      db/
        schema.ts                 # Drizzle tables (sqlite-core)
        client.ts                 # createDb (dialect switch), DB type
        migrate.ts                # applyMigrations
        testDb.ts                 # createTestDb (:memory: + migrations)
      providers/
        types.ts                  # Provider interface + request/result types
        respondTool.ts            # shared respond tool JSON schema
        modelConfig.ts            # static model metadata map + budget helpers
        anthropic.ts              # AnthropicProvider
        openai.ts                 # OpenAIProvider
        registry.ts               # provider factory + provider/model resolution
        contractTests.ts          # shared provider contract suite
        anthropic.test.ts
        openai.test.ts
        modelConfig.test.ts
      context/
        render.ts                 # timeline / current / curated rendering
        curate.ts                 # curateSession
        assemble.ts               # assembleContext + sliding compression
        curate.test.ts
        assemble.test.ts
      services/
        ids.ts                    # newId
        positions.ts              # gap-based position helpers
        conversations.ts
        messages.ts
        draftSessions.ts
        summary.ts
        positions.test.ts
        draftSessions.test.ts
      routes/
        validate.ts               # zod validation helper
        conversations.ts
        messages.ts
        draftSessions.ts
        styleProfiles.ts
      app.ts                      # Hono app factory (deps injected)
      server.ts                   # entrypoint (createDb + real providers)
      app.integration.test.ts
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "ai-conversation-tool",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": false,
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
data/
*.sqlite
*.sqlite-*
.env
```

- [ ] **Step 5: Create `.env.example`**

```
# Single-user constant until proxy header trust is built
DEFAULT_USER_ID=local-user
# Default provider/model when a conversation has no override
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-opus-4-8
# SQLite file (postgres* URLs throw "not yet implemented")
DATABASE_URL=file:./data/app.sqlite
PORT=8787
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

- [ ] **Step 6: Install root dev deps and verify pnpm sees the workspace**

Run: `pnpm install`
Expected: completes; creates `pnpm-lock.yaml`. (No packages yet — that's fine.)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo"
```

---

## Task 2: Shared schemas package (`@app/shared`)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/schemas.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@app/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "noEmit": true },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test** in `packages/shared/src/schemas.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  DraftContent, BriefContent, RespondOutput, contentSchemaForKind,
} from './schemas.js';

describe('content schemas', () => {
  it('accepts a draft with optional subject', () => {
    expect(DraftContent.parse({ body: 'hi' })).toEqual({ body: 'hi' });
    expect(DraftContent.parse({ subject: 'Re: x', body: 'hi' }).subject).toBe('Re: x');
  });

  it('rejects an empty draft body', () => {
    expect(() => DraftContent.parse({ body: '' })).toThrow();
  });

  it('requires a brief goal', () => {
    expect(() => BriefContent.parse({})).toThrow();
    expect(BriefContent.parse({ goal: 'ask for extension' }).goal).toBe('ask for extension');
  });

  it('validates RespondOutput with optional answers', () => {
    const out = RespondOutput.parse({ draft: { body: 'draft text' } });
    expect(out.answers).toBeUndefined();
  });

  it('maps kind to the right content schema', () => {
    expect(contentSchemaForKind('edit')).toBe(DraftContent);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `cd packages/shared && npx vitest run src/schemas.test.ts`
Expected: FAIL — `schemas.js` has no exports yet.

- [ ] **Step 5: Implement `packages/shared/src/schemas.ts`**

```ts
import { z } from 'zod';

// ---- Enums ----
export const Role = z.enum(['me', 'them']);
export const ConversationType = z.enum(['chat', 'email']);
export const MessageKind = z.enum(['reconstructed', 'live']);
export const MessageStatus = z.enum(['received', 'sent']);
export const DraftSessionStatus = z.enum(['open', 'sent', 'abandoned']);
export const DraftTurnRole = z.enum(['user', 'assistant']);
export const DraftTurnKind = z.enum(['brief', 'answers', 'draft', 'edit', 'followup']);

export type Role = z.infer<typeof Role>;
export type ConversationType = z.infer<typeof ConversationType>;
export type DraftTurnKind = z.infer<typeof DraftTurnKind>;

// ---- Per-kind content shapes (draft_turns.content is JSON) ----
export const BriefContent = z.object({
  goal: z.string().min(1),
  background: z.string().optional(),
  questions: z.string().optional(),
});
export const AnswersContent = z.object({ items: z.array(z.string()) });
export const DraftContent = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
});
export const FollowupContent = z.object({ text: z.string().min(1) });

export type BriefContent = z.infer<typeof BriefContent>;
export type AnswersContent = z.infer<typeof AnswersContent>;
export type DraftContent = z.infer<typeof DraftContent>;
export type FollowupContent = z.infer<typeof FollowupContent>;

/** Returns the zod schema that validates a draft_turn's content for a given kind. */
export function contentSchemaForKind(kind: DraftTurnKind) {
  switch (kind) {
    case 'brief': return BriefContent;
    case 'answers': return AnswersContent;
    case 'draft':
    case 'edit': return DraftContent;
    case 'followup': return FollowupContent;
  }
}

// ---- Forced AI tool output ----
export const RespondOutput = z.object({
  answers: AnswersContent.optional(),
  draft: DraftContent,
});
export type RespondOutput = z.infer<typeof RespondOutput>;

// ---- API request DTOs ----
export const CreateConversationInput = z.object({
  title: z.string().min(1),
  type: ConversationType,
  emailSubject: z.string().optional(),
  toneNote: z.string().optional(),
  styleProfileId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  theirName: z.string().optional(),
  myName: z.string().optional(),
});

export const AddMessageInput = z.object({
  senderRole: Role,
  body: z.string().min(1),
  kind: MessageKind.default('reconstructed'),
  status: MessageStatus.optional(), // defaults derived from senderRole if omitted
  afterMessageId: z.string().optional(), // insert-between anchor
});

export const UpdateMessageInput = z.object({ body: z.string().min(1) });
export const ReorderMessageInput = z.object({
  afterMessageId: z.string().nullable(), // null = move to front
});

export const OpenDraftSessionInput = z.object({ brief: BriefContent });
export const AddFollowupInput = z.object({ instruction: z.string().min(1) });
export const EditDraftInput = z.object({ draft: DraftContent });

export const CreateStyleProfileInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
});
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```ts
export * from './schemas.js';
```

- [ ] **Step 7: Install and run the test green**

Run: `pnpm install && cd packages/shared && npx vitest run src/schemas.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): zod content shapes and API DTOs"
```

---

## Task 3: API package scaffold + config + errors

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/vitest.config.ts`, `packages/api/src/config.ts`, `packages/api/src/errors.ts`

- [ ] **Step 1: Create `packages/api/package.json`**

```json
{
  "name": "@app/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "@app/shared": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "better-sqlite3": "^11.5.0",
    "drizzle-orm": "^0.36.0",
    "gpt-tokenizer": "^2.5.0",
    "hono": "^4.6.0",
    "openai": "^4.68.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.7.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "noEmit": true },
  "include": ["src", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Create `packages/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `packages/api/src/config.ts`**

```ts
export const config = {
  defaultUserId: process.env.DEFAULT_USER_ID ?? 'local-user',
  defaultProvider: process.env.DEFAULT_PROVIDER ?? 'anthropic',
  defaultModel: process.env.DEFAULT_MODEL ?? 'claude-opus-4-8',
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/app.sqlite',
  port: Number(process.env.PORT ?? 8787),
};

export const DEFAULT_USER_ID = config.defaultUserId;
```

- [ ] **Step 5: Create `packages/api/src/errors.ts`**

```ts
/** Base for errors the API maps to a specific HTTP status + machine code. */
export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) { super(`${what} not found`, 'not_found', 404); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 'conflict', 409); }
}

export class ValidationError extends AppError {
  constructor(message: string, readonly details?: unknown) {
    super(message, 'validation_error', 400);
  }
}

/** Provider failure (rate limit / timeout / 5xx). retryable hints the UI. */
export class ProviderError extends AppError {
  constructor(message: string, readonly retryable: boolean) {
    super(message, 'provider_error', 502);
  }
}

/** Incompressible context (timeline + current session) alone exceeds budget. */
export class ContextTooLargeError extends AppError {
  constructor(message: string) { super(message, 'context_too_large', 413); }
}

/** Even fully-summarized priors don't fit; UI must let the user pick sessions. */
export class NeedsManualSelectionError extends AppError {
  constructor(readonly sessionIds: string[]) {
    super('Context exceeds budget; choose which prior sessions to include', 'needs_manual_selection', 413);
  }
}
```

- [ ] **Step 6: Install and typecheck**

Run: `pnpm install && cd packages/api && npx tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add packages/api pnpm-lock.yaml
git commit -m "chore(api): scaffold api package, config, typed errors"
```

---

## Task 4: Drizzle schema + DB client + migrations

**Files:**
- Create: `packages/api/src/db/schema.ts`, `packages/api/src/db/client.ts`, `packages/api/src/db/migrate.ts`, `packages/api/src/db/testDb.ts`, `packages/api/drizzle.config.ts`
- Test: `packages/api/src/db/schema.test.ts`

- [ ] **Step 1: Create `packages/api/src/db/schema.ts`**

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type {
  BriefContent, AnswersContent, DraftContent, FollowupContent,
} from '@app/shared';

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(), // chat | email
  emailSubject: text('email_subject'),
  toneNote: text('tone_note'),
  styleProfileId: text('style_profile_id'),
  provider: text('provider'),
  model: text('model'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(), // me | them
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  senderParticipantId: text('sender_participant_id').notNull(),
  body: text('body').notNull(),
  kind: text('kind').notNull(),     // reconstructed | live
  status: text('status').notNull(), // received | sent
  position: integer('position').notNull(),
  createdAt: ts('created_at').notNull(),
});

export const draftSessions = sqliteTable('draft_sessions', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  status: text('status').notNull(), // open | sent | abandoned
  summary: text('summary'),         // generated on send, user-editable
  sentMessageId: text('sent_message_id'),
  createdAt: ts('created_at').notNull(),
  closedAt: ts('closed_at'),
});

type TurnContent = BriefContent | AnswersContent | DraftContent | FollowupContent;

export const draftTurns = sqliteTable('draft_turns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  position: integer('position').notNull(),
  role: text('role').notNull(), // user | assistant
  kind: text('kind').notNull(), // brief | answers | draft | edit | followup
  content: text('content', { mode: 'json' }).$type<TurnContent>().notNull(),
  provider: text('provider'),
  model: text('model'),
  createdAt: ts('created_at').notNull(),
});

export const styleProfiles = sqliteTable('style_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  instructions: text('instructions').notNull(),
});
```

- [ ] **Step 2: Create `packages/api/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 3: Generate the migration**

Run: `cd packages/api && npx drizzle-kit generate`
Expected: writes a `drizzle/0000_*.sql` file with `CREATE TABLE` statements for all six tables.

- [ ] **Step 4: Create `packages/api/src/db/client.ts`**

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DB = ReturnType<typeof drizzle<typeof schema>>;

/** Creates a Drizzle DB. SQLite now; postgres* URLs fail loud (seam only). */
export function createDb(url = process.env.DATABASE_URL ?? 'file:./data/app.sqlite'): DB {
  if (url.startsWith('postgres')) {
    throw new Error(
      'Postgres driver not yet implemented. Use a file: SQLite URL. ' +
      'The schema is single-file so a pg variant is an additive change.',
    );
  }
  const path = url.replace(/^file:/, '');
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}
```

- [ ] **Step 5: Create `packages/api/src/db/migrate.ts`**

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { DB } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, '../../drizzle');

export function applyMigrations(db: DB): void {
  migrate(db, { migrationsFolder });
}
```

- [ ] **Step 6: Create `packages/api/src/db/testDb.ts`**

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { applyMigrations } from './migrate.js';
import type { DB } from './client.js';

/** Fresh in-memory DB with migrations applied — for tests. */
export function createTestDb(): DB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  applyMigrations(db);
  return db;
}
```

- [ ] **Step 7: Write the failing test** `packages/api/src/db/schema.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './testDb.js';
import { conversations } from './schema.js';

describe('schema + migrations', () => {
  it('creates tables and round-trips a conversation row', () => {
    const db = createTestDb();
    const now = new Date();
    db.insert(conversations).values({
      id: 'c1', userId: 'u1', title: 'Test', type: 'chat',
      createdAt: now, updatedAt: now,
    }).run();
    const rows = db.select().from(conversations).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Test');
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 8: Run the test**

Run: `cd packages/api && npx vitest run src/db/schema.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/db packages/api/drizzle.config.ts packages/api/drizzle
git commit -m "feat(api): drizzle schema, db client with pg seam, migrations"
```

---

## Task 5: ID + gap-based position helpers

**Files:**
- Create: `packages/api/src/services/ids.ts`, `packages/api/src/services/positions.ts`
- Test: `packages/api/src/services/positions.test.ts`

- [ ] **Step 1: Create `packages/api/src/services/ids.ts`**

```ts
import { randomUUID } from 'node:crypto';
export const newId = (): string => randomUUID();
```

- [ ] **Step 2: Write the failing test** `packages/api/src/services/positions.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { POSITION_GAP, nextPosition, positionBetween } from './positions.js';

describe('positions', () => {
  it('appends with a gap', () => {
    expect(nextPosition([])).toBe(POSITION_GAP);
    expect(nextPosition([100, 300, 200])).toBe(400);
  });

  it('inserts between two positions', () => {
    expect(positionBetween(100, 200)).toBe(150);
  });

  it('inserts at front and back', () => {
    expect(positionBetween(null, 100)).toBe(50);
    expect(positionBetween(300, null)).toBe(400);
    expect(positionBetween(null, null)).toBe(POSITION_GAP);
  });

  it('throws when the gap is exhausted', () => {
    expect(() => positionBetween(100, 101)).toThrow(/renumber/i);
  });
});
```

- [ ] **Step 3: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/services/positions.test.ts`
Expected: FAIL — `positions.js` missing.

- [ ] **Step 4: Implement `packages/api/src/services/positions.ts`**

```ts
export const POSITION_GAP = 100;

/** Next position to append after the given existing positions. */
export function nextPosition(existing: number[]): number {
  if (existing.length === 0) return POSITION_GAP;
  return Math.max(...existing) + POSITION_GAP;
}

/** A position strictly between `before` and `after` (null = open end). */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_GAP;
  if (before == null) return Math.floor(after! / 2);
  if (after == null) return before + POSITION_GAP;
  const mid = Math.floor((before + after) / 2);
  if (mid <= before) {
    throw new Error('Position gap exhausted; renumbering required');
  }
  return mid;
}
```

- [ ] **Step 5: Run the test green**

Run: `cd packages/api && npx vitest run src/services/positions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/ids.ts packages/api/src/services/positions.ts packages/api/src/services/positions.test.ts
git commit -m "feat(api): id and gap-based position helpers"
```

---

## Task 6: Model metadata config + budget helpers

**Files:**
- Create: `packages/api/src/providers/modelConfig.ts`
- Test: `packages/api/src/providers/modelConfig.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/providers/modelConfig.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { getModelMeta, inputBudget, SAFETY_MARGIN } from './modelConfig.js';

describe('model config', () => {
  it('returns metadata for a known model', () => {
    const m = getModelMeta('claude-opus-4-8');
    expect(m.provider).toBe('anthropic');
    expect(m.contextWindow).toBeGreaterThan(0);
  });

  it('fails loud for an unknown model', () => {
    expect(() => getModelMeta('made-up-model')).toThrow(/unknown model/i);
  });

  it('computes input budget as window - reserve - margin', () => {
    const m = getModelMeta('claude-opus-4-8');
    expect(inputBudget('claude-opus-4-8')).toBe(m.contextWindow - m.outputReserve - SAFETY_MARGIN);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/providers/modelConfig.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/providers/modelConfig.ts`**

```ts
export type ProviderName = 'anthropic' | 'openai';

export interface ModelMeta {
  provider: ProviderName;
  contextWindow: number; // total tokens
  outputReserve: number; // tokens reserved for the model's output
}

/** Global safety margin subtracted from every input budget. */
export const SAFETY_MARGIN = 2000;

/**
 * Static, code-checked model metadata. Edit this map when adopting a new model.
 * An unknown model id fails loud rather than guessing a context window.
 */
export const MODELS: Record<string, ModelMeta> = {
  'claude-opus-4-8': { provider: 'anthropic', contextWindow: 200_000, outputReserve: 8_000 },
  'claude-sonnet-4-6': { provider: 'anthropic', contextWindow: 200_000, outputReserve: 8_000 },
  'claude-haiku-4-5-20251001': { provider: 'anthropic', contextWindow: 200_000, outputReserve: 8_000 },
  'gpt-4.1': { provider: 'openai', contextWindow: 1_000_000, outputReserve: 16_000 },
  'gpt-4o': { provider: 'openai', contextWindow: 128_000, outputReserve: 8_000 },
};

export function getModelMeta(model: string): ModelMeta {
  const meta = MODELS[model];
  if (!meta) {
    throw new Error(`Unknown model "${model}" — add it to MODELS in providers/modelConfig.ts`);
  }
  return meta;
}

/** Token budget available for assembled input for this model. */
export function inputBudget(model: string): number {
  const m = getModelMeta(model);
  return m.contextWindow - m.outputReserve - SAFETY_MARGIN;
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/providers/modelConfig.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/modelConfig.ts packages/api/src/providers/modelConfig.test.ts
git commit -m "feat(api): static model metadata map and budget helpers"
```

---

## Task 7: Provider interface + respond tool + contract suite

**Files:**
- Create: `packages/api/src/providers/types.ts`, `packages/api/src/providers/respondTool.ts`, `packages/api/src/providers/contractTests.ts`

- [ ] **Step 1: Create `packages/api/src/providers/types.ts`**

```ts
import type { RespondOutput } from '@app/shared';
import type { ProviderName } from './modelConfig.js';

export type { ProviderName };

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompleteRequest {
  system: string;
  messages: ProviderMessage[];
  model: string;
  maxOutputTokens: number;
}

export interface CompleteResult {
  output: RespondOutput;     // validated { answers?, draft }
  provider: ProviderName;
  model: string;
}

export interface CompleteTextRequest {
  system: string;
  messages: ProviderMessage[];
  model: string;
  maxOutputTokens: number;
}

export interface CountTokensInput {
  system: string;
  messages: ProviderMessage[];
  model: string;
}

export interface Provider {
  readonly name: ProviderName;
  /** Forces the structured respond({ answers?, draft }) tool. */
  complete(req: CompleteRequest): Promise<CompleteResult>;
  /** Plain-text completion (used for on-send summaries). */
  completeText(req: CompleteTextRequest): Promise<string>;
  /** Token count of the assembled input, for budgeting. */
  countTokens(input: CountTokensInput): Promise<number>;
}
```

- [ ] **Step 2: Create `packages/api/src/providers/respondTool.ts`**

```ts
/** JSON Schema for the forced respond tool. Shared by both vendors. */
export const RESPOND_TOOL_NAME = 'respond';

export const respondInputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    answers: {
      type: 'object',
      additionalProperties: false,
      properties: {
        items: { type: 'array', items: { type: 'string' } },
      },
      required: ['items'],
    },
    draft: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['body'],
    },
  },
  required: ['draft'],
};

export const RESPOND_TOOL_DESCRIPTION =
  'Return your reply. Put answers to the user\'s questions in `answers.items` ' +
  '(omit if none), and the editable message draft in `draft` (`subject` only for emails).';
```

- [ ] **Step 3: Create the shared contract suite** `packages/api/src/providers/contractTests.ts`

```ts
import { expect, it, describe } from 'vitest';
import type { Provider } from './types.js';

/** What each provider test supplies to exercise the shared contract. */
export interface ContractHarness {
  provider: Provider;
  /** Queue the raw tool output the fake SDK should return from complete(). */
  simulateRespond(raw: unknown): void;
  /** Queue the plain text the fake SDK should return from completeText(). */
  simulateText(text: string): void;
  /** The request object handed to the fake SDK on the last complete() call. */
  lastCompleteRequest(): any;
}

export function runProviderContract(label: string, makeHarness: () => ContractHarness): void {
  describe(`${label} provider contract`, () => {
    it('returns a validated respond output', async () => {
      const h = makeHarness();
      h.simulateRespond({ answers: { items: ['yes'] }, draft: { body: 'Hello' } });
      const res = await h.provider.complete({
        system: 'sys', messages: [{ role: 'user', content: 'hi' }],
        model: 'm', maxOutputTokens: 100,
      });
      expect(res.output.draft.body).toBe('Hello');
      expect(res.output.answers?.items).toEqual(['yes']);
      expect(res.provider).toBe(h.provider.name);
    });

    it('forces the respond tool on the request', async () => {
      const h = makeHarness();
      h.simulateRespond({ draft: { body: 'x' } });
      await h.provider.complete({
        system: 's', messages: [{ role: 'user', content: 'hi' }],
        model: 'm', maxOutputTokens: 50,
      });
      const sent = JSON.stringify(h.lastCompleteRequest());
      expect(sent).toContain('respond'); // tool_choice names the respond tool
    });

    it('throws when the model returns a malformed draft', async () => {
      const h = makeHarness();
      h.simulateRespond({ draft: {} }); // missing body
      await expect(h.provider.complete({
        system: 's', messages: [{ role: 'user', content: 'hi' }],
        model: 'm', maxOutputTokens: 50,
      })).rejects.toThrow();
    });

    it('completeText returns plain text', async () => {
      const h = makeHarness();
      h.simulateText('a summary');
      const out = await h.provider.completeText({
        system: 's', messages: [{ role: 'user', content: 'summarize' }],
        model: 'm', maxOutputTokens: 100,
      });
      expect(out).toBe('a summary');
    });

    it('countTokens returns a positive number', async () => {
      const h = makeHarness();
      const n = await h.provider.countTokens({
        system: 'system text', messages: [{ role: 'user', content: 'hello world' }], model: 'm',
      });
      expect(n).toBeGreaterThan(0);
    });
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/types.ts packages/api/src/providers/respondTool.ts packages/api/src/providers/contractTests.ts
git commit -m "feat(api): provider interface, respond tool schema, contract suite"
```

---

## Task 8: AnthropicProvider

**Files:**
- Create: `packages/api/src/providers/anthropic.ts`
- Test: `packages/api/src/providers/anthropic.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/providers/anthropic.test.ts`

```ts
import { runProviderContract, type ContractHarness } from './contractTests.js';
import { AnthropicProvider } from './anthropic.js';

/** Minimal fake of the Anthropic SDK surface the provider touches. */
function makeHarness(): ContractHarness {
  let toolInput: unknown = { draft: { body: 'x' } };
  let text = '';
  let lastReq: any = null;
  const client: any = {
    messages: {
      create: async (req: any) => {
        lastReq = req;
        // If the request forces the respond tool, return a tool_use block.
        if (req.tool_choice) {
          return { content: [{ type: 'tool_use', name: 'respond', input: toolInput }] };
        }
        return { content: [{ type: 'text', text }] };
      },
      countTokens: async (_req: any) => ({ input_tokens: 42 }),
    },
  };
  const provider = new AnthropicProvider(client);
  return {
    provider,
    simulateRespond: (raw) => { toolInput = raw; },
    simulateText: (t) => { text = t; },
    lastCompleteRequest: () => lastReq,
  };
}

runProviderContract('anthropic', makeHarness);
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/providers/anthropic.test.ts`
Expected: FAIL — `anthropic.js` missing.

- [ ] **Step 3: Implement `packages/api/src/providers/anthropic.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { RespondOutput } from '@app/shared';
import { ProviderError } from '../errors.js';
import {
  RESPOND_TOOL_NAME, RESPOND_TOOL_DESCRIPTION, respondInputSchema,
} from './respondTool.js';
import type {
  Provider, CompleteRequest, CompleteResult, CompleteTextRequest, CountTokensInput,
} from './types.js';

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic' as const;
  constructor(private readonly client: Pick<Anthropic, 'messages'>) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    let res: any;
    try {
      res = await this.client.messages.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: [{
          name: RESPOND_TOOL_NAME,
          description: RESPOND_TOOL_DESCRIPTION,
          input_schema: respondInputSchema as any,
        }],
        tool_choice: { type: 'tool', name: RESPOND_TOOL_NAME },
      });
    } catch (err) {
      throw toProviderError(err);
    }
    const block = (res.content ?? []).find((b: any) => b.type === 'tool_use');
    if (!block) throw new ProviderError('Anthropic returned no tool_use block', false);
    const output = RespondOutput.parse(block.input);
    return { output, provider: this.name, model: req.model };
  }

  async completeText(req: CompleteTextRequest): Promise<string> {
    let res: any;
    try {
      res = await this.client.messages.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      });
    } catch (err) {
      throw toProviderError(err);
    }
    return (res.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
  }

  async countTokens(input: CountTokensInput): Promise<number> {
    try {
      const res = await this.client.messages.countTokens({
        model: input.model,
        system: input.system,
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      } as any);
      return res.input_tokens;
    } catch (err) {
      throw toProviderError(err);
    }
  }
}

function toProviderError(err: unknown): ProviderError {
  const status = (err as any)?.status;
  const retryable = status === 429 || (typeof status === 'number' && status >= 500);
  return new ProviderError(`Anthropic request failed: ${(err as Error).message}`, retryable);
}
```

- [ ] **Step 4: Run the contract suite green**

Run: `cd packages/api && npx vitest run src/providers/anthropic.test.ts`
Expected: PASS (5 contract tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/anthropic.ts packages/api/src/providers/anthropic.test.ts
git commit -m "feat(api): AnthropicProvider satisfying the provider contract"
```

---

## Task 9: OpenAIProvider

**Files:**
- Create: `packages/api/src/providers/openai.ts`
- Test: `packages/api/src/providers/openai.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/providers/openai.test.ts`

```ts
import { runProviderContract, type ContractHarness } from './contractTests.js';
import { OpenAIProvider } from './openai.js';

function makeHarness(): ContractHarness {
  let toolArgs: unknown = { draft: { body: 'x' } };
  let text = '';
  let lastReq: any = null;
  const client: any = {
    chat: {
      completions: {
        create: async (req: any) => {
          lastReq = req;
          if (req.tools) {
            return {
              choices: [{
                message: {
                  tool_calls: [{
                    function: { name: 'respond', arguments: JSON.stringify(toolArgs) },
                  }],
                },
              }],
            };
          }
          return { choices: [{ message: { content: text } }] };
        },
      },
    },
  };
  const provider = new OpenAIProvider(client);
  return {
    provider,
    simulateRespond: (raw) => { toolArgs = raw; },
    simulateText: (t) => { text = t; },
    lastCompleteRequest: () => lastReq,
  };
}

runProviderContract('openai', makeHarness);
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/providers/openai.test.ts`
Expected: FAIL — `openai.js` missing.

- [ ] **Step 3: Implement `packages/api/src/providers/openai.ts`**

```ts
import type OpenAI from 'openai';
import { encode } from 'gpt-tokenizer';
import { RespondOutput } from '@app/shared';
import { ProviderError } from '../errors.js';
import {
  RESPOND_TOOL_NAME, RESPOND_TOOL_DESCRIPTION, respondInputSchema,
} from './respondTool.js';
import type {
  Provider, CompleteRequest, CompleteResult, CompleteTextRequest, CountTokensInput,
} from './types.js';

export class OpenAIProvider implements Provider {
  readonly name = 'openai' as const;
  constructor(private readonly client: Pick<OpenAI, 'chat'>) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    let res: any;
    try {
      res = await this.client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        tools: [{
          type: 'function',
          function: {
            name: RESPOND_TOOL_NAME,
            description: RESPOND_TOOL_DESCRIPTION,
            parameters: respondInputSchema as any,
          },
        }],
        tool_choice: { type: 'function', function: { name: RESPOND_TOOL_NAME } },
      });
    } catch (err) {
      throw toProviderError(err);
    }
    const call = res.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new ProviderError('OpenAI returned no tool call', false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.function.arguments);
    } catch {
      throw new ProviderError('OpenAI tool arguments were not valid JSON', false);
    }
    const output = RespondOutput.parse(parsed);
    return { output, provider: this.name, model: req.model };
  }

  async completeText(req: CompleteTextRequest): Promise<string> {
    let res: any;
    try {
      res = await this.client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxOutputTokens,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
    } catch (err) {
      throw toProviderError(err);
    }
    return res.choices?.[0]?.message?.content ?? '';
  }

  async countTokens(input: CountTokensInput): Promise<number> {
    // OpenAI has no count endpoint; tokenize locally. Approximate per-message
    // overhead (~4 tokens/message) is folded into the global safety margin.
    const parts = [input.system, ...input.messages.map((m) => m.content)];
    return parts.reduce((sum, p) => sum + encode(p).length, 0);
  }
}

function toProviderError(err: unknown): ProviderError {
  const status = (err as any)?.status;
  const retryable = status === 429 || (typeof status === 'number' && status >= 500);
  return new ProviderError(`OpenAI request failed: ${(err as Error).message}`, retryable);
}
```

- [ ] **Step 4: Run the contract suite green**

Run: `cd packages/api && npx vitest run src/providers/openai.test.ts`
Expected: PASS (5 contract tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/openai.ts packages/api/src/providers/openai.test.ts
git commit -m "feat(api): OpenAIProvider with local tokenization"
```

---

## Task 10: Provider registry (factory + resolution)

**Files:**
- Create: `packages/api/src/providers/registry.ts`
- Test: `packages/api/src/providers/registry.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/providers/registry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolveProviderModel } from './registry.js';

describe('resolveProviderModel', () => {
  const defaults = { provider: 'anthropic', model: 'claude-opus-4-8' };

  it('uses defaults when the conversation has no overrides', () => {
    expect(resolveProviderModel({ provider: null, model: null }, defaults))
      .toEqual({ provider: 'anthropic', model: 'claude-opus-4-8' });
  });

  it('prefers conversation overrides', () => {
    expect(resolveProviderModel({ provider: 'openai', model: 'gpt-4o' }, defaults))
      .toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('derives provider from the model metadata when only model is overridden', () => {
    expect(resolveProviderModel({ provider: null, model: 'gpt-4o' }, defaults))
      .toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it('fails loud for an unknown model override', () => {
    expect(() => resolveProviderModel({ provider: null, model: 'nope' }, defaults)).toThrow(/unknown model/i);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/providers/registry.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/providers/registry.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getModelMeta, type ProviderName } from './modelConfig.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import type { Provider } from './types.js';

export interface ProviderModel { provider: ProviderName; model: string; }

/** Resolves the effective provider/model from conversation overrides + defaults. */
export function resolveProviderModel(
  overrides: { provider: string | null; model: string | null },
  defaults: { provider: string; model: string },
): ProviderModel {
  const model = overrides.model ?? defaults.model;
  const meta = getModelMeta(model); // fails loud on unknown model
  // If the caller specified a provider, honor it; otherwise derive from the model.
  const provider = (overrides.provider ?? (overrides.model ? meta.provider : defaults.provider)) as ProviderName;
  return { provider, model };
}

/** Builds a live Provider with a real SDK client. Injected into services. */
export type ProviderFactory = (name: ProviderName) => Provider;

export const defaultProviderFactory: ProviderFactory = (name) => {
  if (name === 'anthropic') {
    return new AnthropicProvider(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  }
  return new OpenAIProvider(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
};
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/providers/registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/providers/registry.ts packages/api/src/providers/registry.test.ts
git commit -m "feat(api): provider registry — factory and provider/model resolution"
```

---

## Task 11: Context rendering + curation

**Files:**
- Create: `packages/api/src/context/render.ts`, `packages/api/src/context/curate.ts`
- Test: `packages/api/src/context/curate.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/context/curate.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { curateSession } from './curate.js';

describe('curateSession', () => {
  const turns = [
    { kind: 'brief', content: { goal: 'Ask for a deadline extension', background: 'Busy week' } },
    { kind: 'answers', content: { items: ['Be polite', 'Offer a new date'] } },
    { kind: 'draft', content: { body: 'First draft' } },
    { kind: 'edit', content: { body: 'Final edited draft' } },
  ] as any;

  it('renders brief + answers + the latest draft/edit as the full curated block', () => {
    const c = curateSession({ sessionId: 's1', summary: 'A short summary', turns });
    expect(c.full).toContain('Ask for a deadline extension');
    expect(c.full).toContain('Offer a new date');
    expect(c.full).toContain('Final edited draft'); // latest draft/edit, not "First draft"
    expect(c.full).not.toContain('First draft');
  });

  it('uses the stored summary as the compressed form', () => {
    const c = curateSession({ sessionId: 's1', summary: 'A short summary', turns });
    expect(c.summary).toBe('A short summary');
  });

  it('throws if a prior session has no summary (priors are always sent)', () => {
    expect(() => curateSession({ sessionId: 's1', summary: null, turns })).toThrow(/summary/i);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/context/curate.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `packages/api/src/context/render.ts`**

```ts
import type {
  BriefContent, AnswersContent, DraftContent, FollowupContent,
} from '@app/shared';

export interface RenderTurn {
  kind: string;
  content: BriefContent | AnswersContent | DraftContent | FollowupContent;
}

export function renderBrief(b: BriefContent): string {
  const lines = [`Goal: ${b.goal}`];
  if (b.background) lines.push(`Background: ${b.background}`);
  if (b.questions) lines.push(`Questions: ${b.questions}`);
  return lines.join('\n');
}

export function renderAnswers(a: AnswersContent): string {
  return a.items.map((x, i) => `${i + 1}. ${x}`).join('\n');
}

export function renderDraft(d: DraftContent): string {
  return d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;
}

/** Latest draft- or edit-kind turn in a turn list, or null. */
export function latestDraft(turns: RenderTurn[]): DraftContent | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.kind === 'draft' || t.kind === 'edit') return t.content as DraftContent;
  }
  return null;
}

/** Renders the real message timeline. */
export function renderTimeline(
  messages: { body: string; senderRole: 'me' | 'them'; displayName: string }[],
): string {
  if (messages.length === 0) return '(no prior messages)';
  return messages.map((m) => `${m.displayName} (${m.senderRole}): ${m.body}`).join('\n');
}
```

- [ ] **Step 4: Implement `packages/api/src/context/curate.ts`**

```ts
import { renderBrief, renderAnswers, renderDraft, latestDraft, type RenderTurn } from './render.js';
import type { BriefContent, AnswersContent } from '@app/shared';

export interface CuratedSession {
  sessionId: string;
  full: string;     // brief + answers + final draft
  summary: string;  // stored summary, used under context pressure
}

export interface CurateInput {
  sessionId: string;
  summary: string | null;
  turns: RenderTurn[];
}

/**
 * Curates a *prior* (sent) draft session into brief + answers + final draft,
 * excluding intermediate revisions. Priors always have a summary.
 */
export function curateSession(input: CurateInput): CuratedSession {
  if (input.summary == null) {
    throw new Error(`Prior session ${input.sessionId} has no summary; cannot curate for context`);
  }
  const brief = input.turns.find((t) => t.kind === 'brief');
  const answers = input.turns.find((t) => t.kind === 'answers');
  const draft = latestDraft(input.turns);

  const sections: string[] = [];
  if (brief) sections.push(`[Brief]\n${renderBrief(brief.content as BriefContent)}`);
  if (answers) sections.push(`[AI answers]\n${renderAnswers(answers.content as AnswersContent)}`);
  if (draft) sections.push(`[Final draft]\n${renderDraft(draft)}`);

  return { sessionId: input.sessionId, full: sections.join('\n\n'), summary: input.summary };
}
```

- [ ] **Step 5: Run the test green**

Run: `cd packages/api && npx vitest run src/context/curate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/context/render.ts packages/api/src/context/curate.ts packages/api/src/context/curate.test.ts
git commit -m "feat(api): context rendering and prior-session curation"
```

---

## Task 12: Context assembly with sliding compression

**Files:**
- Create: `packages/api/src/context/assemble.ts`
- Test: `packages/api/src/context/assemble.test.ts`

This is the highest-risk logic. The token counter is injected so the test controls the budget arithmetic exactly.

- [ ] **Step 1: Write the failing test** `packages/api/src/context/assemble.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { assembleContext } from './assemble.js';
import { ContextTooLargeError, NeedsManualSelectionError } from '../errors.js';
import type { CuratedSession } from './curate.js';

// Deterministic counter: 1 token per character of the assembled user content + system.
const charCounter = async (text: string) => text.length;

function priors(): CuratedSession[] {
  return [
    { sessionId: 'old', full: 'F'.repeat(100), summary: 'S'.repeat(10) },
    { sessionId: 'new', full: 'F'.repeat(100), summary: 'S'.repeat(10) },
  ];
}

describe('assembleContext', () => {
  it('keeps all priors full when everything fits', async () => {
    const res = await assembleContext({
      system: '', timeline: 'T', current: 'C', priors: priors(),
      budget: 10_000, countText: charCounter,
    });
    expect(res.usedSummaryFor).toEqual([]);
    expect(res.userContent).toContain('F'.repeat(100));
  });

  it('summarizes the oldest prior first when over budget', async () => {
    // full priors ~ 200+ chars; budget forces swapping the oldest to summary.
    const res = await assembleContext({
      system: '', timeline: 'T', current: 'C', priors: priors(),
      budget: 130, countText: charCounter,
    });
    expect(res.usedSummaryFor).toEqual(['old']);
    expect(res.userContent).toContain('S'.repeat(10)); // old summarized
    expect(res.userContent).toContain('F'.repeat(100)); // new still full
  });

  it('throws NeedsManualSelection when even all-summaries overflow but incompressible fits', async () => {
    await expect(assembleContext({
      system: '', timeline: 'T', current: 'C', priors: priors(),
      budget: 25, countText: charCounter,
    })).rejects.toBeInstanceOf(NeedsManualSelectionError);
  });

  it('throws ContextTooLarge when timeline + current alone exceed budget', async () => {
    await expect(assembleContext({
      system: '', timeline: 'X'.repeat(50), current: 'Y'.repeat(50), priors: [],
      budget: 40, countText: charCounter,
    })).rejects.toBeInstanceOf(ContextTooLargeError);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/context/assemble.test.ts`
Expected: FAIL — `assemble.js` missing.

- [ ] **Step 3: Implement `packages/api/src/context/assemble.ts`**

```ts
import { ContextTooLargeError, NeedsManualSelectionError } from '../errors.js';
import type { CuratedSession } from './curate.js';

export interface AssembleInput {
  system: string;
  timeline: string;          // incompressible
  current: string;           // incompressible (current session, full)
  priors: CuratedSession[];  // oldest -> newest
  budget: number;            // inputBudget(model)
  /** Counts tokens of the assembled (system + userContent) text. */
  countText: (text: string) => Promise<number>;
}

export interface AssembleResult {
  userContent: string;
  usedSummaryFor: string[]; // session ids rendered as summaries
}

/**
 * Builds the single user-message string, preferring full curated priors and
 * sliding the OLDEST priors to summaries one at a time until under budget.
 */
export async function assembleContext(input: AssembleInput): Promise<AssembleResult> {
  // false = full, true = summarized. Start all full.
  const summarized = input.priors.map(() => false);

  const build = () => {
    const priorBlocks = input.priors.map((p, i) =>
      `[Prior session ${p.sessionId}]\n${summarized[i] ? p.summary : p.full}`,
    );
    return [
      '[Conversation timeline]', input.timeline,
      '', '[Prior drafting sessions]', priorBlocks.join('\n\n') || '(none)',
      '', '[Current session]', input.current,
    ].join('\n');
  };

  const total = async () => input.countText(input.system + '\n' + build());

  if ((await total()) <= input.budget) {
    return { userContent: build(), usedSummaryFor: [] };
  }

  // Slide oldest -> newest to summaries until it fits.
  for (let i = 0; i < summarized.length; i++) {
    summarized[i] = true;
    if ((await total()) <= input.budget) {
      return { userContent: build(), usedSummaryFor: idsOf(input.priors, summarized) };
    }
  }

  // Still over budget with everything summarized. Is the incompressible part alone too big?
  const incompressible = [input.system, input.timeline, input.current].join('\n');
  if ((await input.countText(incompressible)) > input.budget) {
    throw new ContextTooLargeError(
      'Conversation timeline and current session alone exceed the model context budget',
    );
  }
  // Incompressible fits, but priors don't even as summaries — defer to manual selection.
  throw new NeedsManualSelectionError(input.priors.map((p) => p.sessionId));
}

function idsOf(priors: CuratedSession[], summarized: boolean[]): string[] {
  return priors.filter((_, i) => summarized[i]).map((p) => p.sessionId);
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/context/assemble.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/context/assemble.ts packages/api/src/context/assemble.test.ts
git commit -m "feat(api): context assembly with sliding compression"
```

---

## Task 13: System prompt builder

**Files:**
- Create: `packages/api/src/context/systemPrompt.ts`
- Test: `packages/api/src/context/systemPrompt.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/context/systemPrompt.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('orders sections general -> specific so the tone note wins on conflict', () => {
    const p = buildSystemPrompt({
      type: 'email',
      styleProfile: { instructions: 'Write formally.' },
      toneNote: 'This friend is casual; be warm and informal.',
    });
    expect(p.indexOf('email')).toBeLessThan(p.indexOf('Write formally.'));
    expect(p.indexOf('Write formally.')).toBeLessThan(p.indexOf('casual'));
  });

  it('omits absent sections', () => {
    const p = buildSystemPrompt({ type: 'chat', styleProfile: null, toneNote: null });
    expect(p).not.toContain('[Style profile]');
    expect(p).not.toContain('[Tone note]');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/context/systemPrompt.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/context/systemPrompt.ts`**

```ts
import type { ConversationType } from '@app/shared';

export interface SystemPromptInput {
  type: ConversationType;
  styleProfile: { instructions: string } | null;
  toneNote: string | null;
}

const TYPE_GUIDANCE: Record<ConversationType, string> = {
  chat: 'You are drafting a chat message. Keep it conversational and concise.',
  email: 'You are drafting an email. Use an appropriate subject line and structure.',
};

/**
 * Sections run general -> specific so the more specific (later) instruction wins:
 * type guidance -> style profile -> tone note.
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  const sections: string[] = [
    'You help the user draft messages. When you reply, call the `respond` tool: ' +
    'put any answers to the user\'s questions in `answers.items`, and the editable ' +
    'message in `draft`. If a later instruction conflicts with an earlier one, follow the later one.',
    `[Message type: ${input.type}]\n${TYPE_GUIDANCE[input.type]}`,
  ];
  if (input.styleProfile) sections.push(`[Style profile]\n${input.styleProfile.instructions}`);
  if (input.toneNote) sections.push(`[Tone note]\n${input.toneNote}`);
  return sections.join('\n\n');
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/context/systemPrompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/context/systemPrompt.ts packages/api/src/context/systemPrompt.test.ts
git commit -m "feat(api): system prompt builder (general -> specific ordering)"
```

---

## Task 14: Conversations service

**Files:**
- Create: `packages/api/src/services/conversations.ts`
- Test: `packages/api/src/services/conversations.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/services/conversations.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation, getConversation, listConversations } from './conversations.js';

describe('conversations service', () => {
  it('creates a conversation with two participants and lists it', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', {
      title: 'With Sam', type: 'chat', theirName: 'Sam', myName: 'Me',
    });
    expect(conv.id).toBeTruthy();

    const fetched = await getConversation(db, 'u1', conv.id);
    expect(fetched.participants.map((p) => p.role).sort()).toEqual(['me', 'them']);
    expect(fetched.participants.find((p) => p.role === 'them')!.displayName).toBe('Sam');

    const all = await listConversations(db, 'u1');
    expect(all).toHaveLength(1);
  });

  it('does not return another user\'s conversation', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'X', type: 'chat' });
    await expect(getConversation(db, 'other', conv.id)).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/services/conversations.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/services/conversations.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { CreateConversationInput } from '@app/shared';
import type { DB } from '../db/client.js';
import { conversations, participants } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { newId } from './ids.js';

type CreateInput = z.infer<typeof CreateConversationInput>;

export async function createConversation(db: DB, userId: string, input: CreateInput) {
  const id = newId();
  const now = new Date();
  db.insert(conversations).values({
    id, userId, title: input.title, type: input.type,
    emailSubject: input.emailSubject ?? null,
    toneNote: input.toneNote ?? null,
    styleProfileId: input.styleProfileId ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    createdAt: now, updatedAt: now,
  }).run();

  db.insert(participants).values([
    { id: newId(), conversationId: id, displayName: input.myName ?? 'Me', role: 'me' },
    { id: newId(), conversationId: id, displayName: input.theirName ?? 'Them', role: 'them' },
  ]).run();

  return getConversation(db, userId, id);
}

export async function getConversation(db: DB, userId: string, id: string) {
  const conv = db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId))).get();
  if (!conv) throw new NotFoundError('Conversation');
  const parts = db.select().from(participants).where(eq(participants.conversationId, id)).all();
  return { ...conv, participants: parts };
}

export async function listConversations(db: DB, userId: string) {
  return db.select().from(conversations).where(eq(conversations.userId, userId)).all();
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/services/conversations.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/conversations.ts packages/api/src/services/conversations.test.ts
git commit -m "feat(api): conversations service with per-user namespacing"
```

---

## Task 15: Messages service

**Files:**
- Create: `packages/api/src/services/messages.ts`
- Test: `packages/api/src/services/messages.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/services/messages.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation } from './conversations.js';
import { addMessage, listMessages, updateMessage, reorderMessage, deleteMessage } from './messages.js';

async function setup() {
  const db = createTestDb();
  const conv = await createConversation(db, 'u1', { title: 'C', type: 'chat' });
  return { db, convId: conv.id };
}

describe('messages service', () => {
  it('appends messages with increasing positions and derives sent/received status', async () => {
    const { db, convId } = await setup();
    const a = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'Hi', kind: 'reconstructed' });
    const b = await addMessage(db, 'u1', convId, { senderRole: 'me', body: 'Hello', kind: 'reconstructed' });
    expect(b.position).toBeGreaterThan(a.position);
    expect(a.status).toBe('received'); // from 'them'
    expect(b.status).toBe('sent');     // from 'me'
  });

  it('inserts between two messages via afterMessageId', async () => {
    const { db, convId } = await setup();
    const a = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'A', kind: 'reconstructed' });
    const c = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'C', kind: 'reconstructed' });
    const b = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'B', kind: 'reconstructed', afterMessageId: a.id });
    const ordered = (await listMessages(db, 'u1', convId)).map((m) => m.body);
    expect(ordered).toEqual(['A', 'B', 'C']);
  });

  it('edits, reorders, and deletes messages', async () => {
    const { db, convId } = await setup();
    const a = await addMessage(db, 'u1', convId, { senderRole: 'me', body: 'one', kind: 'reconstructed' });
    const b = await addMessage(db, 'u1', convId, { senderRole: 'me', body: 'two', kind: 'reconstructed' });
    await updateMessage(db, 'u1', a.id, { body: 'edited' });
    await reorderMessage(db, 'u1', a.id, { afterMessageId: b.id }); // move a after b
    let ordered = (await listMessages(db, 'u1', convId)).map((m) => m.body);
    expect(ordered).toEqual(['two', 'edited']);
    await deleteMessage(db, 'u1', b.id);
    ordered = (await listMessages(db, 'u1', convId)).map((m) => m.body);
    expect(ordered).toEqual(['edited']);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/services/messages.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/services/messages.ts`**

```ts
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AddMessageInput, UpdateMessageInput, ReorderMessageInput } from '@app/shared';
import type { DB } from '../db/client.js';
import { messages, participants } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { getConversation } from './conversations.js';
import { newId } from './ids.js';
import { nextPosition, positionBetween } from './positions.js';

type AddInput = z.infer<typeof AddMessageInput>;
type UpdateInput = z.infer<typeof UpdateMessageInput>;
type ReorderInput = z.infer<typeof ReorderMessageInput>;

async function participantFor(db: DB, userId: string, convId: string, role: 'me' | 'them') {
  await getConversation(db, userId, convId); // authorizes the conversation
  const p = db.select().from(participants)
    .where(and(eq(participants.conversationId, convId), eq(participants.role, role))).get();
  if (!p) throw new NotFoundError('Participant');
  return p;
}

function orderedPositions(db: DB, convId: string): { id: string; position: number }[] {
  return db.select({ id: messages.id, position: messages.position }).from(messages)
    .where(eq(messages.conversationId, convId)).orderBy(asc(messages.position)).all();
}

/** Position to use when inserting after `afterId` (or append when undefined). */
function insertPosition(db: DB, convId: string, afterId?: string | null): number {
  const all = orderedPositions(db, convId);
  if (afterId === undefined) return nextPosition(all.map((m) => m.position));
  if (afterId === null) return positionBetween(null, all[0]?.position ?? null);
  const idx = all.findIndex((m) => m.id === afterId);
  if (idx === -1) throw new NotFoundError('Anchor message');
  return positionBetween(all[idx]!.position, all[idx + 1]?.position ?? null);
}

export async function addMessage(db: DB, userId: string, convId: string, input: AddInput) {
  const sender = await participantFor(db, userId, convId, input.senderRole);
  const status = input.status ?? (input.senderRole === 'me' ? 'sent' : 'received');
  const position = insertPosition(db, convId, input.afterMessageId);
  const row = {
    id: newId(), conversationId: convId, senderParticipantId: sender.id,
    body: input.body, kind: input.kind, status, position, createdAt: new Date(),
  };
  db.insert(messages).values(row).run();
  return row;
}

export async function listMessages(db: DB, userId: string, convId: string) {
  await getConversation(db, userId, convId);
  return db.select().from(messages)
    .where(eq(messages.conversationId, convId)).orderBy(asc(messages.position)).all();
}

function ownedMessage(db: DB, userId: string, id: string) {
  const msg = db.select().from(messages).where(eq(messages.id, id)).get();
  if (!msg) throw new NotFoundError('Message');
  return msg; // ownership enforced via getConversation below in callers
}

export async function updateMessage(db: DB, userId: string, id: string, input: UpdateInput) {
  const msg = ownedMessage(db, userId, id);
  await getConversation(db, userId, msg.conversationId);
  db.update(messages).set({ body: input.body }).where(eq(messages.id, id)).run();
}

export async function reorderMessage(db: DB, userId: string, id: string, input: ReorderInput) {
  const msg = ownedMessage(db, userId, id);
  await getConversation(db, userId, msg.conversationId);
  const others = orderedPositions(db, msg.conversationId).filter((m) => m.id !== id);
  let position: number;
  if (input.afterMessageId === null) {
    position = positionBetween(null, others[0]?.position ?? null);
  } else {
    const idx = others.findIndex((m) => m.id === input.afterMessageId);
    if (idx === -1) throw new NotFoundError('Anchor message');
    position = positionBetween(others[idx]!.position, others[idx + 1]?.position ?? null);
  }
  db.update(messages).set({ position }).where(eq(messages.id, id)).run();
}

export async function deleteMessage(db: DB, userId: string, id: string) {
  const msg = ownedMessage(db, userId, id);
  await getConversation(db, userId, msg.conversationId);
  db.delete(messages).where(eq(messages.id, id)).run();
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/services/messages.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/messages.ts packages/api/src/services/messages.test.ts
git commit -m "feat(api): messages service — add, reorder, edit, delete"
```

---

## Task 16: Summary service

**Files:**
- Create: `packages/api/src/services/summary.ts`
- Test: `packages/api/src/services/summary.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/services/summary.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { generateSummary } from './summary.js';
import type { Provider } from '../providers/types.js';

function fakeProvider(captured: { req?: any }): Provider {
  return {
    name: 'anthropic',
    complete: async () => { throw new Error('unused'); },
    completeText: async (req) => { captured.req = req; return 'SUMMARY'; },
    countTokens: async () => 0,
  };
}

describe('generateSummary', () => {
  it('summarizes the curated full block via completeText', async () => {
    const captured: { req?: any } = {};
    const out = await generateSummary(fakeProvider(captured), 'model-x', 'BRIEF + ANSWERS + DRAFT');
    expect(out).toBe('SUMMARY');
    expect(captured.req.model).toBe('model-x');
    expect(captured.req.messages[0].content).toContain('BRIEF + ANSWERS + DRAFT');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/services/summary.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/services/summary.ts`**

```ts
import { getModelMeta } from '../providers/modelConfig.js';
import type { Provider } from '../providers/types.js';

const SUMMARY_SYSTEM =
  'Summarize the drafting session below into a few sentences capturing the goal, ' +
  'key decisions, and the gist of the final draft. This summary may later replace ' +
  'the full session as context, so preserve what would matter for future drafts.';

/** Generates the on-send summary of a session's curated triple (brief + answers + final draft). */
export async function generateSummary(
  provider: Provider, model: string, curatedFull: string,
): Promise<string> {
  const reserve = getModelMeta(model).outputReserve;
  return provider.completeText({
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', content: curatedFull }],
    model,
    maxOutputTokens: Math.min(1024, reserve),
  });
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/services/summary.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/summary.ts packages/api/src/services/summary.test.ts
git commit -m "feat(api): summary generation via completeText"
```

---

## Task 17: Draft sessions service (open, followup, edit, finalize, abandon)

This is the orchestration core. It depends on conversations, messages, context assembly, the provider, and the summary service. The provider is injected so tests run with no network.

**Files:**
- Create: `packages/api/src/services/draftSessions.ts`
- Test: `packages/api/src/services/draftSessions.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/services/draftSessions.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation } from './conversations.js';
import { addMessage, listMessages } from './messages.js';
import { openDraftSession, addFollowup, editDraft, finalizeSession, abandonSession } from './draftSessions.js';
import type { Provider } from '../providers/types.js';
import type { RespondOutput } from '@app/shared';

/** Fake provider returning queued respond outputs; counts tokens by char length. */
function fakeProvider(queue: RespondOutput[]): Provider {
  return {
    name: 'anthropic',
    complete: async () => {
      const out = queue.shift();
      if (!out) throw new Error('no queued respond output');
      return { output: out, provider: 'anthropic', model: 'claude-opus-4-8' };
    },
    completeText: async () => 'a summary',
    countTokens: async ({ system, messages }) =>
      system.length + messages.reduce((n, m) => n + m.content.length, 0),
  };
}

const deps = (queue: RespondOutput[]) => ({
  provider: fakeProvider(queue),
  defaults: { provider: 'anthropic', model: 'claude-opus-4-8' },
});

async function convWithHistory() {
  const db = createTestDb();
  const conv = await createConversation(db, 'u1', { title: 'C', type: 'chat', theirName: 'Sam' });
  await addMessage(db, 'u1', conv.id, { senderRole: 'them', body: 'Can you send the report?', kind: 'reconstructed' });
  return { db, convId: conv.id };
}

describe('draft sessions service', () => {
  it('opens a session and records brief, answers, and draft turns', async () => {
    const { db, convId } = await convWithHistory();
    const result = await openDraftSession(db, 'u1', convId,
      { brief: { goal: 'Promise the report by Friday' } },
      deps([{ answers: { items: ['Be concise'] }, draft: { body: 'It will be ready Friday.' } }]),
    );
    expect(result.session.status).toBe('open');
    const kinds = result.turns.map((t) => t.kind);
    expect(kinds).toEqual(['brief', 'answers', 'draft']);
    expect(result.turns.find((t) => t.kind === 'draft')!.provider).toBe('anthropic');
  });

  it('rejects opening a second session while one is open', async () => {
    const { db, convId } = await convWithHistory();
    await openDraftSession(db, 'u1', convId, { brief: { goal: 'g' } },
      deps([{ draft: { body: 'd1' } }]));
    await expect(openDraftSession(db, 'u1', convId, { brief: { goal: 'g2' } },
      deps([{ draft: { body: 'd2' } }]))).rejects.toThrow(/already.*open/i);
  });

  it('revises on followup, re-sending the current draft as the base', async () => {
    const { db, convId } = await convWithHistory();
    const opened = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g' } },
      deps([{ draft: { body: 'first draft' } }]));
    const followQueue: RespondOutput[] = [{ draft: { body: 'second draft' } }];
    const prov = fakeProvider(followQueue);
    // Spy on what the provider receives.
    let seenUserContent = '';
    const spy: Provider = { ...prov, complete: async (req) => {
      seenUserContent = req.messages.map((m) => m.content).join('\n');
      return prov.complete(req);
    } };
    const res = await addFollowup(db, 'u1', opened.session.id, { instruction: 'make it warmer' },
      { provider: spy, defaults: { provider: 'anthropic', model: 'claude-opus-4-8' } });
    expect(res.turns.map((t) => t.kind)).toEqual(['followup', 'draft']);
    expect(seenUserContent).toContain('first draft');   // current draft passed as base
    expect(seenUserContent).toContain('make it warmer'); // the new instruction
  });

  it('records a manual edit as the new current draft without calling the AI', async () => {
    const { db, convId } = await convWithHistory();
    const opened = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g' } },
      deps([{ draft: { body: 'ai draft' } }]));
    const res = await editDraft(db, 'u1', opened.session.id, { draft: { body: 'my hand edit' } });
    expect(res.turn.kind).toBe('edit');
    expect((res.turn.content as any).body).toBe('my hand edit');
  });

  it('finalizes: writes a sent message, stores a summary, closes the session', async () => {
    const { db, convId } = await convWithHistory();
    const opened = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g' } },
      deps([{ draft: { body: 'final body' } }]));
    const res = await finalizeSession(db, 'u1', opened.session.id,
      deps([])); // no respond calls; summary uses completeText
    expect(res.session.status).toBe('sent');
    expect(res.session.summary).toBe('a summary');
    const msgs = await listMessages(db, 'u1', convId);
    const sent = msgs.find((m) => m.status === 'sent' && m.kind === 'live');
    expect(sent!.body).toBe('final body');
  });

  it('abandons a session, freeing the conversation for a new one', async () => {
    const { db, convId } = await convWithHistory();
    const opened = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g' } },
      deps([{ draft: { body: 'd' } }]));
    await abandonSession(db, 'u1', opened.session.id);
    // A new session can now open.
    const again = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g2' } },
      deps([{ draft: { body: 'd2' } }]));
    expect(again.session.status).toBe('open');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/services/draftSessions.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/services/draftSessions.ts`**

```ts
import { and, asc, eq, ne } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  OpenDraftSessionInput, AddFollowupInput, EditDraftInput, RespondOutput, DraftContent,
} from '@app/shared';
import type { DB } from '../db/client.js';
import { conversations, draftSessions, draftTurns, messages, participants, styleProfiles } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { getConversation } from './conversations.js';
import { newId } from './ids.js';
import { nextPosition } from './positions.js';
import { generateSummary } from './summary.js';
import { resolveProviderModel } from '../providers/registry.js';
import { inputBudget, getModelMeta } from '../providers/modelConfig.js';
import { buildSystemPrompt } from '../context/systemPrompt.js';
import { assembleContext } from '../context/assemble.js';
import { curateSession } from '../context/curate.js';
import {
  renderTimeline, renderBrief, renderAnswers, renderDraft, latestDraft, type RenderTurn,
} from '../context/render.js';
import type { Provider } from '../providers/types.js';

export interface DraftDeps {
  provider: Provider;
  defaults: { provider: string; model: string };
}

type OpenInput = z.infer<typeof OpenDraftSessionInput>;
type FollowupInput = z.infer<typeof AddFollowupInput>;
type EditInput = z.infer<typeof EditDraftInput>;

// ---- helpers ----

function sessionTurns(db: DB, sessionId: string): RenderTurn[] {
  return db.select().from(draftTurns).where(eq(draftTurns.sessionId, sessionId))
    .orderBy(asc(draftTurns.position)).all()
    .map((t) => ({ kind: t.kind, content: t.content as any }));
}

function rawTurns(db: DB, sessionId: string) {
  return db.select().from(draftTurns).where(eq(draftTurns.sessionId, sessionId))
    .orderBy(asc(draftTurns.position)).all();
}

function nextTurnPosition(db: DB, sessionId: string): number {
  const positions = db.select({ position: draftTurns.position }).from(draftTurns)
    .where(eq(draftTurns.sessionId, sessionId)).all().map((r) => r.position);
  return nextPosition(positions);
}

function insertTurn(db: DB, sessionId: string, t: {
  role: 'user' | 'assistant'; kind: string; content: unknown;
  provider?: string | null; model?: string | null;
}) {
  const row = {
    id: newId(), sessionId, position: nextTurnPosition(db, sessionId),
    role: t.role, kind: t.kind, content: t.content as any,
    provider: t.provider ?? null, model: t.model ?? null, createdAt: new Date(),
  };
  db.insert(draftTurns).values(row).run();
  return row;
}

async function ownedSession(db: DB, userId: string, sessionId: string) {
  const session = db.select().from(draftSessions).where(eq(draftSessions.id, sessionId)).get();
  if (!session) throw new NotFoundError('Draft session');
  await getConversation(db, userId, session.conversationId); // authorize
  return session;
}

/** Renders the real timeline with participant roles/names. */
function timelineText(db: DB, convId: string): string {
  const parts = db.select().from(participants).where(eq(participants.conversationId, convId)).all();
  const byId = new Map(parts.map((p) => [p.id, p]));
  const rows = db.select().from(messages).where(eq(messages.conversationId, convId))
    .orderBy(asc(messages.position)).all();
  return renderTimeline(rows.map((m) => {
    const p = byId.get(m.senderParticipantId)!;
    return { body: m.body, senderRole: p.role as 'me' | 'them', displayName: p.displayName };
  }));
}

/** Renders the current session for the AI: brief + answers-so-far + current draft + new instruction. */
function currentText(turns: RenderTurn[], extraInstruction?: string): string {
  const sections: string[] = [];
  const brief = turns.find((t) => t.kind === 'brief');
  const answers = turns.find((t) => t.kind === 'answers');
  const draft = latestDraft(turns);
  if (brief) sections.push(`[Brief]\n${renderBrief(brief.content as any)}`);
  if (answers) sections.push(`[Prior AI answers]\n${renderAnswers(answers.content as any)}`);
  if (draft) sections.push(`[Current draft — revise THIS exact text]\n${renderDraft(draft)}`);
  if (extraInstruction) sections.push(`[New instruction]\n${extraInstruction}`);
  return sections.join('\n\n');
}

/** Curated context of prior SENT sessions (oldest -> newest), excluding this one. */
function priorCurated(db: DB, convId: string, excludeSessionId: string) {
  const sents = db.select().from(draftSessions)
    .where(and(eq(draftSessions.conversationId, convId), eq(draftSessions.status, 'sent')))
    .orderBy(asc(draftSessions.closedAt)).all()
    .filter((s) => s.id !== excludeSessionId);
  return sents.map((s) => curateSession({
    sessionId: s.id, summary: s.summary, turns: sessionTurns(db, s.id),
  }));
}

function styleProfileFor(db: DB, conv: { styleProfileId: string | null }) {
  if (!conv.styleProfileId) return null;
  const sp = db.select().from(styleProfiles).where(eq(styleProfiles.id, conv.styleProfileId)).get();
  return sp ? { instructions: sp.instructions } : null;
}

/** Runs one AI round: assemble context, call complete(), persist answers?+draft turns. */
async function runAiRound(
  db: DB, userId: string, sessionId: string, deps: DraftDeps, extraInstruction?: string,
) {
  const session = db.select().from(draftSessions).where(eq(draftSessions.id, sessionId)).get()!;
  const conv = await getConversation(db, userId, session.conversationId);
  const { model } = resolveProviderModel(
    { provider: conv.provider, model: conv.model }, deps.defaults,
  );

  const system = buildSystemPrompt({
    type: conv.type as any,
    styleProfile: styleProfileFor(db, conv),
    toneNote: conv.toneNote,
  });
  const turns = sessionTurns(db, sessionId);
  const assembled = await assembleContext({
    system,
    timeline: timelineText(db, session.conversationId),
    current: currentText(turns, extraInstruction),
    priors: priorCurated(db, session.conversationId, sessionId),
    budget: inputBudget(model),
    countText: (text) => deps.provider.countTokens({ system, messages: [{ role: 'user', content: text }], model }),
  });

  const result = await deps.provider.complete({
    system,
    messages: [{ role: 'user', content: assembled.userContent }],
    model,
    maxOutputTokens: getModelMeta(model).outputReserve,
  });

  const created: any[] = [];
  if (result.output.answers) {
    created.push(insertTurn(db, sessionId, {
      role: 'assistant', kind: 'answers', content: result.output.answers,
      provider: result.provider, model: result.model,
    }));
  }
  created.push(insertTurn(db, sessionId, {
    role: 'assistant', kind: 'draft', content: result.output.draft,
    provider: result.provider, model: result.model,
  }));
  return created;
}

// ---- public API ----

export async function openDraftSession(
  db: DB, userId: string, convId: string, input: OpenInput, deps: DraftDeps,
) {
  await getConversation(db, userId, convId);
  const existingOpen = db.select().from(draftSessions)
    .where(and(eq(draftSessions.conversationId, convId), eq(draftSessions.status, 'open'))).get();
  if (existingOpen) throw new ConflictError('A draft session is already open for this conversation');

  const sessionId = newId();
  db.insert(draftSessions).values({
    id: sessionId, conversationId: convId, status: 'open',
    summary: null, sentMessageId: null, createdAt: new Date(), closedAt: null,
  }).run();

  insertTurn(db, sessionId, { role: 'user', kind: 'brief', content: input.brief });
  await runAiRound(db, userId, sessionId, deps);

  const session = db.select().from(draftSessions).where(eq(draftSessions.id, sessionId)).get()!;
  return { session, turns: rawTurns(db, sessionId) };
}

export async function addFollowup(
  db: DB, userId: string, sessionId: string, input: FollowupInput, deps: DraftDeps,
) {
  const session = await ownedSession(db, userId, sessionId);
  if (session.status !== 'open') throw new ConflictError('Draft session is not open');
  const followup = insertTurn(db, sessionId, { role: 'user', kind: 'followup', content: { text: input.instruction } });
  const ai = await runAiRound(db, userId, sessionId, deps, input.instruction);
  return { turns: [followup, ...ai] };
}

export async function editDraft(db: DB, userId: string, sessionId: string, input: EditInput) {
  const session = await ownedSession(db, userId, sessionId);
  if (session.status !== 'open') throw new ConflictError('Draft session is not open');
  const turn = insertTurn(db, sessionId, { role: 'user', kind: 'edit', content: input.draft });
  return { turn };
}

export async function finalizeSession(db: DB, userId: string, sessionId: string, deps: DraftDeps) {
  const session = await ownedSession(db, userId, sessionId);
  if (session.status !== 'open') throw new ConflictError('Draft session is not open');

  const turns = sessionTurns(db, sessionId);
  const draft = latestDraft(turns);
  if (!draft) throw new ConflictError('Cannot finalize a session with no draft');

  const conv = await getConversation(db, userId, session.conversationId);
  const me = db.select().from(participants)
    .where(and(eq(participants.conversationId, session.conversationId), eq(participants.role, 'me'))).get()!;

  // Write the sent message onto the timeline.
  const positions = db.select({ position: messages.position }).from(messages)
    .where(eq(messages.conversationId, session.conversationId)).all().map((r) => r.position);
  const sentMessageId = newId();
  db.insert(messages).values({
    id: sentMessageId, conversationId: session.conversationId, senderParticipantId: me.id,
    body: draft.body, kind: 'live', status: 'sent',
    position: nextPosition(positions), createdAt: new Date(),
  }).run();

  // For emails, persist the chosen subject on the conversation.
  if (conv.type === 'email' && draft.subject) {
    db.update(conversations).set({ emailSubject: draft.subject, updatedAt: new Date() })
      .where(eq(conversations.id, session.conversationId)).run();
  }

  // Generate the summary from the curated triple using the conversation's model.
  const { model } = resolveProviderModel({ provider: conv.provider, model: conv.model }, deps.defaults);
  const curated = curateSession({ sessionId, summary: 'pending', turns }); // build the full block
  const summary = await generateSummary(deps.provider, model, curated.full);

  db.update(draftSessions).set({
    status: 'sent', sentMessageId, summary, closedAt: new Date(),
  }).where(eq(draftSessions.id, sessionId)).run();

  const updated = db.select().from(draftSessions).where(eq(draftSessions.id, sessionId)).get()!;
  return { session: updated };
}

export async function abandonSession(db: DB, userId: string, sessionId: string) {
  const session = await ownedSession(db, userId, sessionId);
  if (session.status !== 'open') throw new ConflictError('Draft session is not open');
  db.update(draftSessions).set({ status: 'abandoned', closedAt: new Date() })
    .where(eq(draftSessions.id, sessionId)).run();
}
```

> Note: `curateSession` requires a non-null summary, but at finalize time we only need its `full` rendering. Passing the sentinel `'pending'` satisfies the guard; the real summary is generated from `curated.full` and stored separately. (The `ne` import is unused by the final code — remove it if your linter flags it.)

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/services/draftSessions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/draftSessions.ts packages/api/src/services/draftSessions.test.ts
git commit -m "feat(api): draft session orchestration — open/followup/edit/finalize/abandon"
```

---

## Task 18: Style profiles service

**Files:**
- Create: `packages/api/src/services/styleProfiles.ts`
- Test: `packages/api/src/services/styleProfiles.test.ts`

- [ ] **Step 1: Write the failing test** `packages/api/src/services/styleProfiles.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createStyleProfile, listStyleProfiles } from './styleProfiles.js';

describe('style profiles service', () => {
  it('creates and lists style profiles per user', async () => {
    const db = createTestDb();
    const sp = await createStyleProfile(db, 'u1', { name: 'Formal', instructions: 'Be formal.' });
    expect(sp.id).toBeTruthy();
    expect(await listStyleProfiles(db, 'u1')).toHaveLength(1);
    expect(await listStyleProfiles(db, 'u2')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `cd packages/api && npx vitest run src/services/styleProfiles.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `packages/api/src/services/styleProfiles.ts`**

```ts
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { CreateStyleProfileInput } from '@app/shared';
import type { DB } from '../db/client.js';
import { styleProfiles } from '../db/schema.js';
import { newId } from './ids.js';

type CreateInput = z.infer<typeof CreateStyleProfileInput>;

export async function createStyleProfile(db: DB, userId: string, input: CreateInput) {
  const row = {
    id: newId(), userId, name: input.name,
    description: input.description ?? null, instructions: input.instructions,
  };
  db.insert(styleProfiles).values(row).run();
  return row;
}

export async function listStyleProfiles(db: DB, userId: string) {
  return db.select().from(styleProfiles).where(eq(styleProfiles.userId, userId)).all();
}
```

- [ ] **Step 4: Run the test green**

Run: `cd packages/api && npx vitest run src/services/styleProfiles.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/styleProfiles.ts packages/api/src/services/styleProfiles.test.ts
git commit -m "feat(api): style profiles service"
```

---

## Task 19: Hono app — validation, error handling, routes

**Files:**
- Create: `packages/api/src/routes/validate.ts`, `packages/api/src/routes/conversations.ts`, `packages/api/src/routes/messages.ts`, `packages/api/src/routes/draftSessions.ts`, `packages/api/src/routes/styleProfiles.ts`, `packages/api/src/app.ts`

- [ ] **Step 1: Create `packages/api/src/routes/validate.ts`**

```ts
import type { z } from 'zod';
import { ValidationError } from '../errors.js';

/** Parses a request body with a zod schema, throwing a ValidationError on failure. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }
  return result.data;
}
```

- [ ] **Step 2: Create `packages/api/src/app.ts`** (app factory + error middleware + route mounting)

```ts
import { Hono } from 'hono';
import { AppError } from './errors.js';
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
      return c.json({ error: { code: err.code, message: err.message, details: (err as any).details } }, err.status as any);
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
```

- [ ] **Step 3: Create `packages/api/src/routes/conversations.ts`**

```ts
import { Hono } from 'hono';
import { CreateConversationInput } from '@app/shared';
import type { AppContext } from '../app.js';
import { parseBody } from './validate.js';
import { createConversation, getConversation, listConversations } from '../services/conversations.js';

export function conversationRoutes() {
  const r = new Hono<AppContext>();

  r.post('/', async (c) => {
    const input = parseBody(CreateConversationInput, await c.req.json());
    const conv = await createConversation(c.get('deps').db, c.get('userId'), input);
    return c.json(conv, 201);
  });

  r.get('/', async (c) => {
    return c.json(await listConversations(c.get('deps').db, c.get('userId')));
  });

  r.get('/:id', async (c) => {
    return c.json(await getConversation(c.get('deps').db, c.get('userId'), c.req.param('id')));
  });

  return r;
}
```

- [ ] **Step 4: Create `packages/api/src/routes/messages.ts`**

```ts
import { Hono } from 'hono';
import { AddMessageInput, UpdateMessageInput, ReorderMessageInput } from '@app/shared';
import type { AppContext } from '../app.js';
import { parseBody } from './validate.js';
import { addMessage, listMessages, updateMessage, reorderMessage, deleteMessage } from '../services/messages.js';

export function messageRoutes() {
  const r = new Hono<AppContext>();

  r.post('/conversations/:id/messages', async (c) => {
    const input = parseBody(AddMessageInput, await c.req.json());
    const msg = await addMessage(c.get('deps').db, c.get('userId'), c.req.param('id'), input);
    return c.json(msg, 201);
  });

  r.get('/conversations/:id/messages', async (c) => {
    return c.json(await listMessages(c.get('deps').db, c.get('userId'), c.req.param('id')));
  });

  r.patch('/messages/:id', async (c) => {
    const input = parseBody(UpdateMessageInput, await c.req.json());
    await updateMessage(c.get('deps').db, c.get('userId'), c.req.param('id'), input);
    return c.body(null, 204);
  });

  r.post('/messages/:id/reorder', async (c) => {
    const input = parseBody(ReorderMessageInput, await c.req.json());
    await reorderMessage(c.get('deps').db, c.get('userId'), c.req.param('id'), input);
    return c.body(null, 204);
  });

  r.delete('/messages/:id', async (c) => {
    await deleteMessage(c.get('deps').db, c.get('userId'), c.req.param('id'));
    return c.body(null, 204);
  });

  return r;
}
```

- [ ] **Step 5: Create `packages/api/src/routes/draftSessions.ts`**

```ts
import { Hono } from 'hono';
import { OpenDraftSessionInput, AddFollowupInput, EditDraftInput } from '@app/shared';
import type { AppContext } from '../app.js';
import { draftDepsFor } from '../app.js';
import { parseBody } from './validate.js';
import { getConversation } from '../services/conversations.js';
import {
  openDraftSession, addFollowup, editDraft, finalizeSession, abandonSession,
} from '../services/draftSessions.js';
import { draftSessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '../errors.js';

/** Loads a session's conversation overrides so we can pick the right provider. */
async function overridesForSession(c: any, sessionId: string) {
  const db = c.get('deps').db;
  const session = db.select().from(draftSessions).where(eq(draftSessions.id, sessionId)).get();
  if (!session) throw new NotFoundError('Draft session');
  const conv = await getConversation(db, c.get('userId'), session.conversationId);
  return { provider: conv.provider, model: conv.model };
}

export function draftSessionRoutes() {
  const r = new Hono<AppContext>();

  r.post('/conversations/:id/draft-sessions', async (c) => {
    const input = parseBody(OpenDraftSessionInput, await c.req.json());
    const deps = c.get('deps');
    const conv = await getConversation(deps.db, c.get('userId'), c.req.param('id'));
    const draftDeps = draftDepsFor(deps, { provider: conv.provider, model: conv.model });
    const result = await openDraftSession(deps.db, c.get('userId'), c.req.param('id'), input, draftDeps);
    return c.json(result, 201);
  });

  r.post('/draft-sessions/:id/followups', async (c) => {
    const input = parseBody(AddFollowupInput, await c.req.json());
    const deps = c.get('deps');
    const draftDeps = draftDepsFor(deps, await overridesForSession(c, c.req.param('id')));
    return c.json(await addFollowup(deps.db, c.get('userId'), c.req.param('id'), input, draftDeps));
  });

  r.post('/draft-sessions/:id/edits', async (c) => {
    const input = parseBody(EditDraftInput, await c.req.json());
    return c.json(await editDraft(c.get('deps').db, c.get('userId'), c.req.param('id'), input));
  });

  r.post('/draft-sessions/:id/finalize', async (c) => {
    const deps = c.get('deps');
    const draftDeps = draftDepsFor(deps, await overridesForSession(c, c.req.param('id')));
    return c.json(await finalizeSession(deps.db, c.get('userId'), c.req.param('id'), draftDeps));
  });

  r.post('/draft-sessions/:id/abandon', async (c) => {
    await abandonSession(c.get('deps').db, c.get('userId'), c.req.param('id'));
    return c.body(null, 204);
  });

  return r;
}
```

- [ ] **Step 6: Create `packages/api/src/routes/styleProfiles.ts`**

```ts
import { Hono } from 'hono';
import { CreateStyleProfileInput } from '@app/shared';
import type { AppContext } from '../app.js';
import { parseBody } from './validate.js';
import { createStyleProfile, listStyleProfiles } from '../services/styleProfiles.js';

export function styleProfileRoutes() {
  const r = new Hono<AppContext>();

  r.post('/', async (c) => {
    const input = parseBody(CreateStyleProfileInput, await c.req.json());
    return c.json(await createStyleProfile(c.get('deps').db, c.get('userId'), input), 201);
  });

  r.get('/', async (c) => {
    return c.json(await listStyleProfiles(c.get('deps').db, c.get('userId')));
  });

  return r;
}
```

- [ ] **Step 7: Typecheck**

Run: `cd packages/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/app.ts packages/api/src/routes
git commit -m "feat(api): Hono app factory, validation, error middleware, routes"
```

---

## Task 20: End-to-end integration test

**Files:**
- Create: `packages/api/src/app.integration.test.ts`

- [ ] **Step 1: Write the integration test** `packages/api/src/app.integration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createApp, type AppDeps } from './app.js';
import { createTestDb } from './db/testDb.js';
import type { Provider } from './providers/types.js';
import type { RespondOutput } from '@app/shared';

/** Fake provider with a queue of respond outputs; char-length token counts. */
function fakeProvider(queue: RespondOutput[]): Provider {
  return {
    name: 'anthropic',
    complete: async () => {
      const out = queue.shift() ?? { draft: { body: 'fallback' } };
      return { output: out, provider: 'anthropic', model: 'claude-opus-4-8' };
    },
    completeText: async () => 'session summary',
    countTokens: async ({ system, messages }) =>
      system.length + messages.reduce((n, m) => n + m.content.length, 0),
  };
}

function makeApp(queue: RespondOutput[]) {
  const db = createTestDb();
  const deps: AppDeps = {
    db,
    providerFactory: () => fakeProvider(queue),
    defaults: { provider: 'anthropic', model: 'claude-opus-4-8' },
    userId: 'u1',
  };
  return createApp(deps);
}

async function json(res: Response) { return res.json() as any; }

describe('full flow integration', () => {
  it('create -> reconstruct -> draft -> finalize -> next turn', async () => {
    const queue: RespondOutput[] = [
      { answers: { items: ['Be warm'] }, draft: { body: 'Friday works for me.' } }, // open round 1
      { draft: { body: 'Thanks — see you then!' } },                                // next-turn round
    ];
    const app = makeApp(queue);

    // 1. Create conversation
    const conv = await json(await app.request('/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'With Sam', type: 'chat', theirName: 'Sam' }),
    }));
    expect(conv.id).toBeTruthy();

    // 2. Reconstruct a message from them
    await app.request(`/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderRole: 'them', body: 'Can we meet Friday?', kind: 'reconstructed' }),
    });

    // 3. Open a draft session
    const opened = await json(await app.request(`/conversations/${conv.id}/draft-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { goal: 'Agree to Friday' } }),
    }));
    expect(opened.turns.map((t: any) => t.kind)).toEqual(['brief', 'answers', 'draft']);
    const sessionId = opened.session.id;

    // 4. Finalize
    const finalized = await json(await app.request(`/draft-sessions/${sessionId}/finalize`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }));
    expect(finalized.session.status).toBe('sent');
    expect(finalized.session.summary).toBe('session summary');

    // Timeline now has the sent message
    const msgs = await json(await app.request(`/conversations/${conv.id}/messages`));
    expect(msgs.some((m: any) => m.status === 'sent' && m.body === 'Friday works for me.')).toBe(true);

    // 5. Their reply (live) + next draft session reuses prior curated context
    await app.request(`/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderRole: 'them', body: 'Great, 2pm?', kind: 'live' }),
    });
    const opened2 = await json(await app.request(`/conversations/${conv.id}/draft-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { goal: 'Confirm 2pm' } }),
    }));
    expect(opened2.turns.find((t: any) => t.kind === 'draft').content.body).toBe('Thanks — see you then!');
  });

  it('rejects a second open session with 409', async () => {
    const app = makeApp([{ draft: { body: 'd1' } }, { draft: { body: 'd2' } }]);
    const conv = await json(await app.request('/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'C', type: 'chat' }),
    }));
    await app.request(`/conversations/${conv.id}/draft-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { goal: 'g' } }),
    });
    const res = await app.request(`/conversations/${conv.id}/draft-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { goal: 'g2' } }),
    });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('conflict');
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `cd packages/api && npx vitest run src/app.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the entire suite**

Run: `cd packages/api && npx vitest run` then `cd packages/shared && npx vitest run`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/app.integration.test.ts
git commit -m "test(api): end-to-end flow and one-open-session integration tests"
```

---

## Task 21: Server entrypoint + Docker + run docs

**Files:**
- Create: `packages/api/src/server.ts`, `packages/api/Dockerfile`, `docker-compose.yml`, `README.md`

- [ ] **Step 1: Create `packages/api/src/server.ts`**

```ts
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
```

- [ ] **Step 2: Verify it boots and serves /health**

Run: `cd packages/api && DATABASE_URL=file:./data/dev.sqlite PORT=8787 npx tsx src/server.ts &` then `sleep 1 && curl -s http://localhost:8787/health`
Expected: `{"ok":true}`. Then stop the server: `kill %1`.

- [ ] **Step 3: Create `packages/api/Dockerfile`**

```dockerfile
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

# Install workspace deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN pnpm install --frozen-lockfile

# Copy sources
COPY packages/shared packages/shared
COPY packages/api packages/api

ENV NODE_ENV=production
EXPOSE 8787
WORKDIR /app/packages/api
CMD ["pnpm", "start"]
```

- [ ] **Step 4: Create `docker-compose.yml`** (repo root)

```yaml
services:
  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    ports:
      - "8787:8787"
    environment:
      DEFAULT_USER_ID: local-user
      DEFAULT_PROVIDER: anthropic
      DEFAULT_MODEL: claude-opus-4-8
      DATABASE_URL: file:/data/app.sqlite
      PORT: "8787"
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    volumes:
      - app-data:/data

volumes:
  app-data:
```

- [ ] **Step 5: Create `README.md`** (repo root)

````markdown
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
````

- [ ] **Step 6: Build the image to verify the Dockerfile**

Run: `docker compose build api`
Expected: builds successfully. (Skip if Docker is unavailable; note it in the task.)

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/server.ts packages/api/Dockerfile docker-compose.yml README.md
git commit -m "feat(api): server entrypoint, Dockerfile, compose, run docs"
```

---

## Final verification

- [ ] **Run the full test suite from the repo root**

Run: `pnpm -r test`
Expected: all `@app/shared` and `@app/api` tests PASS.

- [ ] **Typecheck everything**

Run: `pnpm -r typecheck`
Expected: no type errors.

---

## Spec coverage map

| Spec requirement | Task(s) |
| --- | --- |
| Three deployable pieces, TS, containerized (API piece) | 1, 21 (web is plan 2) |
| Hono REST API, no auth, `user_id` namespacing | 14–19, `DEFAULT_USER_ID` in 3 |
| Drizzle + SQLite now, Postgres-ready seam | 4 |
| Provider interface (Anthropic + OpenAI), forced `respond` tool | 7, 8, 9 |
| `countTokens` for budgeting | 8 (API), 9 (local), 12 |
| Model/budget metadata, fail loud on unknown model | 6 |
| Per-conversation provider/model override + free switching, turn provenance | 10, 17 |
| `participants` / `conversations` / `messages` / `draft_sessions` / `draft_turns` / `style_profiles` | 4 |
| Gap-based positions, editable/reorderable messages | 5, 15 |
| JSON `draft_turns.content` shaped by kind; immutable turns | 2, 4, 17 |
| One open draft session per conversation | 17 |
| Brief / answers / draft / edit / followup turns; stateless re-send of current draft | 17 |
| Finalize: write `sent` message, generate + store editable summary | 16, 17 |
| Curated prior-session context (brief + answers + final draft); abandoned excluded | 11, 17 |
| System prompt ordering (type → style → tone), tone overrides style | 13 |
| Sliding compression; budget = window − reserve − margin; fail loud / manual-selection | 12, 17 |
| Typed provider errors with retry; non-destructive abandon | 8, 9, 17 |
| zod validation at the boundary, shared with client | 2, 19 |
| Unit (context/compression/curation), integration (full flow), provider contract tests | 7, 11, 12, 20 |
| Dockerfile + docker-compose, SQLite on a volume | 21 |

## Out of scope (separate plans / deferrals)

- React + Vite web app — **Plan 2**.
- Timeline compression, header-trust multi-user, style learning, streaming — spec deferrals.

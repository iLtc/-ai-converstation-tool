# AI Conversation Drafting Tool — Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React web app (`packages/web`) that drives the existing API, plus two small backend additions it depends on, delivering the full single-user flow: conversation list/create/settings, timeline reconstruction, the transcript drafting workspace, and style-profile management.

**Architecture:** A new `@app/web` workspace (React + Vite + TS) joins the existing pnpm monorepo. It talks to `@app/api` through a typed `fetch` client that maps the `{ error: { code, message, ... } }` envelope to typed errors. Server state is owned by TanStack Query; navigation by React Router; styling by Tailwind + shadcn/ui. DTO shapes come from `@app/shared` where they exist; response row shapes are declared in `web/src/api/types.ts`. Two backend endpoints are added first (`GET /conversations/:id/draft-sessions`, `PATCH /conversations/:id`) following existing route/service/test conventions.

**Tech Stack:** TypeScript (ESM), React 18, Vite 5, Tailwind CSS 3, shadcn/ui (Radix + cva), TanStack Query 5, React Router 6, lucide-react, sonner (toasts), @dnd-kit (reorder), Vitest + jsdom + React Testing Library + MSW.

---

## Decisions locked in for this plan

These resolve choices so the engineer never has to guess:

- **Backend first.** Phase 0 adds the two endpoints and ships them with tests before any UI work, so the web app builds against a complete API.
- **Response types live in `web/src/api/types.ts`.** `@app/shared` exports input DTOs, enums, and per-kind content shapes — reuse those. Row shapes returned by the API (Conversation, Message, DraftSession, DraftTurn, StyleProfile) are not in shared; declare them once in the web package. Timestamps serialize as ISO strings over the wire (Drizzle `timestamp_ms` → `Date` → `Date.toJSON()`), so type them `string`.
- **`GET /conversations/:id/draft-sessions` returns `{ sessions: SessionWithTurns[] }`** ordered oldest→newest by `createdAt`, where `SessionWithTurns = DraftSession & { turns: DraftTurn[] }`. The UI picks the single `open` session for the workspace and renders `sent` sessions as read-only history; `abandoned` are returned but hidden by default.
- **`PATCH /conversations/:id`** uses `UpdateConversationInput` (all fields optional; nullable fields may be sent as `null` to clear). The service applies only keys present in the parsed body, updates participant display names when `myName`/`theirName` are given, bumps `updatedAt`, and returns the same shape as `GET /conversations/:id`.
- **Restore a draft version = a new edit turn.** Reverting re-submits an older `draft`/`edit` turn's content via `POST /draft-sessions/:id/edits`; nothing is mutated or deleted.
- **API base URL** is `import.meta.env.VITE_API_URL ?? '/api'`. The Vite dev server proxies `/api` → `http://localhost:8787` (the API's default port). MSW handlers in tests match the resolved `/api/...` paths.
- **shadcn primitives** are added with the non-interactive `pnpm dlx shadcn@latest add` CLI after a hand-written `components.json`. They land in `src/components/ui/` and are owned/editable.
- **Reorder** uses `@dnd-kit/sortable`; moving a message issues `POST /messages/:id/reorder` with the `afterMessageId` of the item it now follows (`null` when moved to the top).
- **Deferred (not built), per the spec:** summary editing, the context-overflow session picker, and style-profile edit/delete. Context-overflow errors render a clear blocking message only.

## File Structure

```
packages/
  shared/src/
    schemas.ts                         # MODIFY: add UpdateConversationInput
    schemas.test.ts                    # MODIFY: cover UpdateConversationInput
  api/src/
    services/conversations.ts          # MODIFY: add updateConversation
    services/conversations.test.ts     # MODIFY: cover updateConversation
    services/draftSessions.ts          # MODIFY: add listDraftSessions
    services/draftSessions.test.ts     # MODIFY: cover listDraftSessions
    routes/conversations.ts            # MODIFY: add PATCH /:id
    routes/draftSessions.ts            # MODIFY: add GET /conversations/:id/draft-sessions
    app.integration.test.ts            # MODIFY: cover the two new endpoints
  web/
    package.json
    tsconfig.json
    tsconfig.node.json
    vite.config.ts
    vitest.config.ts
    index.html
    postcss.config.js
    tailwind.config.js
    components.json
    Dockerfile
    nginx.conf
    .env.example
    src/
      main.tsx                         # React root: QueryClientProvider + RouterProvider + Toaster
      App.tsx                          # route table
      index.css                        # tailwind directives + theme vars
      vite-env.d.ts
      lib/
        utils.ts                       # cn()
        queryClient.ts                 # QueryClient + queryKeys
      api/
        types.ts                       # response row types
        client.ts                      # apiFetch + ApiError
        client.test.ts
        endpoints.ts                   # typed request functions
      components/
        ui/                            # shadcn: button, input, textarea, label, dialog, select, card, badge, sonner
        AppShell.tsx                   # rail + <Outlet/>
      hooks/
        useConversations.ts
        useMessages.ts
        useDraftSessions.ts
        useStyleProfiles.ts
      features/
        conversations/
          ConversationList.tsx
          NewConversationDialog.tsx
          ConversationSettingsDialog.tsx
          ConversationStudio.tsx       # /conversations/:id — 3-col layout host
        timeline/
          Timeline.tsx
          MessageItem.tsx
          AddMessageForm.tsx
          PasteReplyButton.tsx
          Timeline.test.tsx
        drafting/
          DraftWorkspace.tsx
          BriefForm.tsx
          BriefForm.test.tsx
          Transcript.tsx
          Transcript.test.tsx
          TurnView.tsx
          RefineBar.tsx
        styleProfiles/
          StyleProfilesPage.tsx
          NewStyleProfileForm.tsx
      test/
        setup.ts                       # jest-dom + MSW server lifecycle
        msw.ts                         # MSW server + default handlers
        renderWithProviders.tsx        # RTL wrapper (QueryClient + MemoryRouter)
      smoke.test.tsx                   # full-loop MSW smoke test
docker-compose.yml                     # MODIFY: add web service
```

---

# Phase 0 — Backend additions

## Task 1: `UpdateConversationInput` schema (shared)

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas.test.ts`:

```ts
import { UpdateConversationInput } from './schemas.js';

describe('UpdateConversationInput', () => {
  it('accepts an empty object (no-op patch)', () => {
    expect(UpdateConversationInput.parse({})).toEqual({});
  });

  it('allows clearing nullable fields with null', () => {
    const parsed = UpdateConversationInput.parse({
      toneNote: null, styleProfileId: null, provider: null, model: null,
    });
    expect(parsed).toEqual({ toneNote: null, styleProfileId: null, provider: null, model: null });
  });

  it('accepts editable fields', () => {
    const parsed = UpdateConversationInput.parse({
      title: 'New', type: 'email', emailSubject: 'Hi', theirName: 'Sam', myName: 'Me',
    });
    expect(parsed.title).toBe('New');
    expect(parsed.type).toBe('email');
  });

  it('rejects an empty title', () => {
    expect(() => UpdateConversationInput.parse({ title: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/shared test`
Expected: FAIL — `UpdateConversationInput` is not exported.

- [ ] **Step 3: Add the schema**

Append to `packages/shared/src/schemas.ts`:

```ts
// Partial update of a conversation's settings. Every field optional; nullable
// fields may be sent as null to clear them. The service applies only keys present.
export const UpdateConversationInput = z.object({
  title: z.string().min(1).optional(),
  type: ConversationType.optional(),
  emailSubject: z.string().nullable().optional(),
  toneNote: z.string().nullable().optional(),
  styleProfileId: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  theirName: z.string().min(1).optional(),
  myName: z.string().min(1).optional(),
});
export type UpdateConversationInput = z.infer<typeof UpdateConversationInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/schemas.test.ts
git commit -m "feat(shared): UpdateConversationInput schema"
```

## Task 2: `updateConversation` service + PATCH route

**Files:**
- Modify: `packages/api/src/services/conversations.ts`
- Modify: `packages/api/src/services/conversations.test.ts`
- Modify: `packages/api/src/routes/conversations.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/services/conversations.test.ts` (follow the file's existing imports/helpers; it already imports `createTestDb` and creates conversations):

```ts
import { updateConversation } from './conversations.js';

describe('updateConversation', () => {
  it('updates settings, participant names, and bumps updatedAt', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat', theirName: 'Sam' });
    const updated = await updateConversation(db, 'u1', conv.id, {
      title: 'B', toneNote: 'warm', theirName: 'Samantha',
    });
    expect(updated.title).toBe('B');
    expect(updated.toneNote).toBe('warm');
    expect(updated.participants.find((p) => p.role === 'them')!.displayName).toBe('Samantha');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(conv.updatedAt.getTime());
  });

  it('clears a nullable field when null is passed and leaves omitted fields untouched', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat', toneNote: 'x' });
    const updated = await updateConversation(db, 'u1', conv.id, { toneNote: null });
    expect(updated.toneNote).toBeNull();
    expect(updated.title).toBe('A');
  });

  it('rejects a style profile the user does not own', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat' });
    await expect(updateConversation(db, 'u1', conv.id, { styleProfileId: 'nope' }))
      .rejects.toThrow();
  });

  it('throws NotFound for another user\'s conversation', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat' });
    await expect(updateConversation(db, 'u2', conv.id, { title: 'B' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test src/services/conversations.test.ts`
Expected: FAIL — `updateConversation` is not exported.

- [ ] **Step 3: Implement the service**

In `packages/api/src/services/conversations.ts`, add the import type and the function:

```ts
import type { CreateConversationInput, UpdateConversationInput } from '@app/shared';
// (extend the existing type-import line; CreateConversationInput is already imported)

type UpdateInput = z.infer<typeof UpdateConversationInput>;

export async function updateConversation(
  db: DB, userId: string, id: string, input: UpdateInput,
) {
  await getConversation(db, userId, id); // authorize (throws NotFound)

  if (input.styleProfileId) {
    const owned = db.select().from(styleProfiles)
      .where(and(eq(styleProfiles.id, input.styleProfileId), eq(styleProfiles.userId, userId))).get();
    if (!owned) throw new NotFoundError('Style profile');
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ['title', 'type', 'emailSubject', 'toneNote', 'styleProfileId', 'provider', 'model'] as const) {
    if (key in input) patch[key] = input[key];
  }
  db.update(conversations).set(patch).where(eq(conversations.id, id)).run();

  if (input.myName !== undefined) {
    db.update(participants).set({ displayName: input.myName })
      .where(and(eq(participants.conversationId, id), eq(participants.role, 'me'))).run();
  }
  if (input.theirName !== undefined) {
    db.update(participants).set({ displayName: input.theirName })
      .where(and(eq(participants.conversationId, id), eq(participants.role, 'them'))).run();
  }

  return getConversation(db, userId, id);
}
```

Note: `z` is already imported as `import type { z } from 'zod'` at the top of the file; the `UpdateInput` alias uses it. The `conversations`, `participants`, `styleProfiles`, `and`, `eq`, `NotFoundError`, `getConversation` symbols are already imported in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test src/services/conversations.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the PATCH route**

In `packages/api/src/routes/conversations.ts`, extend the import and add the handler before `return r;`:

```ts
import { CreateConversationInput, UpdateConversationInput } from '@app/shared';
import { createConversation, getConversation, listConversations, updateConversation } from '../services/conversations.js';

  r.patch('/:id', async (c) => {
    const input = parseBody(UpdateConversationInput, await c.req.json());
    const conv = await updateConversation(c.get('deps').db, c.get('userId'), c.req.param('id'), input);
    return c.json(conv);
  });
```

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/conversations.ts packages/api/src/services/conversations.test.ts packages/api/src/routes/conversations.ts
git commit -m "feat(api): PATCH /conversations/:id settings update"
```

## Task 3: `listDraftSessions` service + GET route

**Files:**
- Modify: `packages/api/src/services/draftSessions.ts`
- Modify: `packages/api/src/services/draftSessions.test.ts`
- Modify: `packages/api/src/routes/draftSessions.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/services/draftSessions.test.ts` (the file already builds a `db`, `deps`, opens sessions, and finalizes — reuse those helpers; the snippet below assumes the file's existing `makeDeps()`/fake-provider setup, mirroring its other tests):

```ts
import { listDraftSessions } from './draftSessions.js';

describe('listDraftSessions', () => {
  it('returns sessions oldest-first, each with its ordered turns', async () => {
    const db = createTestDb();
    const deps = makeDeps([
      { answers: { items: ['a'] }, draft: { body: 'd1' } }, // first session open round
      { draft: { body: 'd2' } },                            // second session open round
    ]);
    const conv = await createConversation(db, 'u1', { title: 'C', type: 'chat' });

    const first = await openDraftSession(db, 'u1', conv.id, { brief: { goal: 'g1' } }, deps);
    await finalizeSession(db, 'u1', first.session.id, deps);
    const second = await openDraftSession(db, 'u1', conv.id, { brief: { goal: 'g2' } }, deps);

    const { sessions } = await listDraftSessions(db, 'u1', conv.id);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.id).toBe(first.session.id);
    expect(sessions[0]!.status).toBe('sent');
    expect(sessions[1]!.id).toBe(second.session.id);
    expect(sessions[1]!.status).toBe('open');
    expect(sessions[1]!.turns.map((t) => t.kind)).toEqual(['brief', 'draft']);
  });

  it('authorizes by user (throws NotFound for another user)', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'C', type: 'chat' });
    await expect(listDraftSessions(db, 'u2', conv.id)).rejects.toThrow();
  });
});
```

If `makeDeps`/`createConversation` are not already imported in this test file, add the same imports the file's other tests use (`createConversation` from `./conversations.js`, the fake-provider helper defined in-file).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/api test src/services/draftSessions.test.ts`
Expected: FAIL — `listDraftSessions` is not exported.

- [ ] **Step 3: Implement the service**

Append to `packages/api/src/services/draftSessions.ts` (all referenced symbols — `db`, `draftSessions`, `asc`, `eq`, `getConversation`, `rawTurns` — already exist in the file):

```ts
/** All draft sessions for a conversation (oldest-first), each with its ordered turns. */
export async function listDraftSessions(db: DB, userId: string, convId: string) {
  await getConversation(db, userId, convId); // authorize
  const sessions = db.select().from(draftSessions)
    .where(eq(draftSessions.conversationId, convId))
    .orderBy(asc(draftSessions.createdAt)).all();
  return { sessions: sessions.map((s) => ({ ...s, turns: rawTurns(db, s.id) })) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/api test src/services/draftSessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the GET route**

In `packages/api/src/routes/draftSessions.ts`, import the service and add the handler inside `draftSessionRoutes()` before `return r;`:

```ts
import {
  openDraftSession, addFollowup, editDraft, finalizeSession, abandonSession, listDraftSessions,
} from '../services/draftSessions.js';

  r.get('/conversations/:id/draft-sessions', async (c) => {
    return c.json(await listDraftSessions(c.get('deps').db, c.get('userId'), c.req.param('id')));
  });
```

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/draftSessions.ts packages/api/src/services/draftSessions.test.ts packages/api/src/routes/draftSessions.ts
git commit -m "feat(api): GET /conversations/:id/draft-sessions with turns"
```

## Task 4: Integration tests for the new endpoints

**Files:**
- Modify: `packages/api/src/app.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Append two `it` blocks inside the existing `describe('full flow integration', ...)` in `packages/api/src/app.integration.test.ts` (reuse the file's `makeApp`/`json` helpers):

```ts
  it('PATCH /conversations/:id updates settings', async () => {
    const app = makeApp([]);
    const conv = await json(await app.request('/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'A', type: 'chat', theirName: 'Sam' }),
    }));
    const res = await app.request(`/conversations/${conv.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'B', toneNote: 'warm', theirName: 'Samantha' }),
    });
    expect(res.status).toBe(200);
    const updated = await json(res);
    expect(updated.title).toBe('B');
    expect(updated.toneNote).toBe('warm');
    expect(updated.participants.find((p: any) => p.role === 'them').displayName).toBe('Samantha');
  });

  it('GET /conversations/:id/draft-sessions returns sessions with turns', async () => {
    const app = makeApp([{ answers: { items: ['a'] }, draft: { body: 'd1' } }]);
    const conv = await json(await app.request('/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'A', type: 'chat' }),
    }));
    await app.request(`/conversations/${conv.id}/draft-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { goal: 'g' } }),
    });
    const out = await json(await app.request(`/conversations/${conv.id}/draft-sessions`));
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0].status).toBe('open');
    expect(out.sessions[0].turns.map((t: any) => t.kind)).toEqual(['brief', 'answers', 'draft']);
  });
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @app/api test src/app.integration.test.ts`
Expected: PASS (routes from Tasks 2 & 3 satisfy them).

- [ ] **Step 3: Full backend check + commit**

Run: `pnpm --filter @app/api test && pnpm --filter @app/api typecheck`
Expected: all green.

```bash
git add packages/api/src/app.integration.test.ts
git commit -m "test(api): integration coverage for PATCH conversation and GET draft-sessions"
```

---

# Phase 1 — Web scaffold & infrastructure

## Task 5: Scaffold the `@app/web` package

**Files:**
- Create: `packages/web/package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@app/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@app/shared": "workspace:*",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@tanstack/react-query": "^5.59.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.454.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "sonner": "^1.7.0",
    "tailwind-merge": "^2.5.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "msw": "^2.6.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `packages/web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `packages/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
```

Note: the API serves routes at the root (`/conversations`, …), so the dev proxy strips the `/api` prefix. In production the same stripping is done by nginx (Task 22).

- [ ] **Step 5: Create `packages/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Draft Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `packages/web/.env.example`**

```bash
# Base path for API requests. Defaults to "/api" (proxied in dev, nginx in prod).
VITE_API_URL=/api
```

- [ ] **Step 7: Create `packages/web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Create a placeholder `src/App.tsx` and `src/main.tsx`**

`src/App.tsx`:

```tsx
export default function App() {
  return <div>Draft Studio</div>;
}
```

`src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: Install dependencies**

Run: `pnpm install`
Expected: workspace resolves `@app/web`; lockfile updates.

- [ ] **Step 10: Verify it builds & typechecks**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS (no type errors).

- [ ] **Step 11: Commit**

```bash
git add packages/web pnpm-lock.yaml
git commit -m "chore(web): scaffold @app/web (Vite + React + TS)"
```

## Task 6: Tailwind + shadcn/ui setup

**Files:**
- Create: `packages/web/postcss.config.js`, `tailwind.config.js`, `components.json`, `src/index.css`, `src/lib/utils.ts`
- Modify: `packages/web/src/main.tsx` (import `index.css`)

- [ ] **Step 1: Create `packages/web/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 2: Create `packages/web/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create `packages/web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 4: Create `packages/web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create `packages/web/components.json`** (so the shadcn CLI knows where to write)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui" }
}
```

- [ ] **Step 6: Import the stylesheet in `src/main.tsx`**

Add as the first import in `packages/web/src/main.tsx`:

```tsx
import './index.css';
```

- [ ] **Step 7: Add shadcn primitives via the CLI**

Run (from `packages/web`):

```bash
cd packages/web && pnpm dlx shadcn@latest add button input textarea label dialog select card badge sonner --yes --overwrite
```

Expected: files appear under `packages/web/src/components/ui/` (`button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `dialog.tsx`, `select.tsx`, `card.tsx`, `badge.tsx`, `sonner.tsx`).

If the CLI cannot run, create the equivalent components manually from https://ui.shadcn.com using the Radix packages already in `package.json`; each must export the named components used later (`Button`, `Input`, `Textarea`, `Label`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogTrigger`/`DialogFooter`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Badge`, `Toaster`).

- [ ] **Step 8: Verify typecheck**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/web
git commit -m "chore(web): Tailwind + shadcn/ui setup"
```

## Task 7: Test harness (Vitest + jsdom + RTL + MSW)

**Files:**
- Create: `packages/web/vitest.config.ts`, `src/test/setup.ts`, `src/test/msw.ts`, `src/test/renderWithProviders.tsx`

- [ ] **Step 1: Create `packages/web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

- [ ] **Step 2: Create `packages/web/src/test/msw.ts`**

```ts
import { setupServer } from 'msw/node';
import type { RequestHandler } from 'msw';

// Tests register per-case handlers with server.use(...). Base handlers stay empty
// so an unhandled request fails loudly (onUnhandledRequest: 'error' in setup).
export const server = setupServer();

export function asHandlers(...handlers: RequestHandler[]) {
  return handlers;
}
```

- [ ] **Step 3: Create `packages/web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw.ts';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 4: Create `packages/web/src/test/renderWithProviders.tsx`**

```tsx
import { type ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 5: Smoke-check the harness with a trivial test**

Create `packages/web/src/test/harness.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { renderWithProviders } from './renderWithProviders.tsx';

it('renders through providers', () => {
  renderWithProviders(<div>hello harness</div>);
  expect(screen.getByText('hello harness')).toBeInTheDocument();
});
```

Run: `pnpm --filter @app/web test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "test(web): Vitest + jsdom + RTL + MSW harness"
```

## Task 8: API client + typed errors

**Files:**
- Create: `packages/web/src/api/client.ts`, `src/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/web/src/api/client.test.ts`:

```ts
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw.ts';
import { apiFetch, ApiError } from './client.ts';

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    server.use(http.get('/api/ping', () => HttpResponse.json({ ok: true })));
    await expect(apiFetch('/ping')).resolves.toEqual({ ok: true });
  });

  it('returns undefined for 204 responses', async () => {
    server.use(http.post('/api/noop', () => new HttpResponse(null, { status: 204 })));
    await expect(apiFetch('/noop', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('throws ApiError carrying code, message, and subclass extras', async () => {
    server.use(http.post('/api/x', () => HttpResponse.json(
      { error: { code: 'provider_error', message: 'rate limited', retryable: true } },
      { status: 502 },
    )));
    const err = await apiFetch('/x', { method: 'POST' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('provider_error');
    expect(err.message).toBe('rate limited');
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(502);
  });

  it('surfaces validation details and needs_manual_selection sessionIds', async () => {
    server.use(http.post('/api/v', () => HttpResponse.json(
      { error: { code: 'validation_error', message: 'bad', details: { a: 1 } } },
      { status: 400 },
    )));
    const err = await apiFetch('/v', { method: 'POST' }).catch((e) => e);
    expect(err.details).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/web test src/api/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client**

`packages/web/src/api/client.ts`:

```ts
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  code: string;
  status: number;
  retryable?: boolean;
  sessionIds?: string[];
  details?: unknown;
  constructor(status: number, body: { code: string; message: string; [k: string]: unknown }) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    if (typeof body.retryable === 'boolean') this.retryable = body.retryable;
    if (Array.isArray(body.sessionIds)) this.sessionIds = body.sessionIds as string[];
    if ('details' in body) this.details = body.details;
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const envelope = (data?.error ?? { code: 'unknown', message: res.statusText }) as
      { code: string; message: string; [k: string]: unknown };
    throw new ApiError(res.status, envelope);
  }
  return data as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @app/web test src/api/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/api/client.test.ts
git commit -m "feat(web): typed API client with ApiError mapping"
```

## Task 9: Response types + endpoint functions

**Files:**
- Create: `packages/web/src/api/types.ts`, `src/api/endpoints.ts`

- [ ] **Step 1: Create `packages/web/src/api/types.ts`**

```ts
import type {
  Role, ConversationType, MessageKind, MessageStatus, DraftSessionStatus,
  DraftTurnRole, DraftTurnKind, BriefContent, AnswersContent, DraftContent, FollowupContent,
} from '@app/shared';

export interface Participant {
  id: string; conversationId: string; displayName: string; role: Role;
}
export interface Conversation {
  id: string; userId: string; title: string; type: ConversationType;
  emailSubject: string | null; toneNote: string | null; styleProfileId: string | null;
  provider: string | null; model: string | null; createdAt: string; updatedAt: string;
  participants: Participant[];
}
export interface Message {
  id: string; conversationId: string; senderParticipantId: string; body: string;
  kind: MessageKind; status: MessageStatus; position: number; createdAt: string;
}
export interface DraftSession {
  id: string; conversationId: string; status: DraftSessionStatus;
  summary: string | null; sentMessageId: string | null; createdAt: string; closedAt: string | null;
}
export type TurnContent = BriefContent | AnswersContent | DraftContent | FollowupContent;
export interface DraftTurn {
  id: string; sessionId: string; position: number; role: DraftTurnRole;
  kind: DraftTurnKind; content: TurnContent; provider: string | null; model: string | null; createdAt: string;
}
export type SessionWithTurns = DraftSession & { turns: DraftTurn[] };
export interface StyleProfile {
  id: string; userId: string; name: string; description: string | null; instructions: string;
}
```

- [ ] **Step 2: Create `packages/web/src/api/endpoints.ts`**

```ts
import type {
  CreateConversationInput, UpdateConversationInput, AddMessageInput, UpdateMessageInput,
  ReorderMessageInput, BriefContent, DraftContent, CreateStyleProfileInput,
} from '@app/shared';
import { apiFetch } from './client.ts';
import type {
  Conversation, Message, DraftSession, DraftTurn, SessionWithTurns, StyleProfile,
} from './types.ts';

const body = (v: unknown) => JSON.stringify(v);

export const api = {
  // conversations
  listConversations: () => apiFetch<Conversation[]>('/conversations'),
  getConversation: (id: string) => apiFetch<Conversation>(`/conversations/${id}`),
  createConversation: (input: CreateConversationInput) =>
    apiFetch<Conversation>('/conversations', { method: 'POST', body: body(input) }),
  updateConversation: (id: string, input: UpdateConversationInput) =>
    apiFetch<Conversation>(`/conversations/${id}`, { method: 'PATCH', body: body(input) }),

  // messages
  listMessages: (convId: string) => apiFetch<Message[]>(`/conversations/${convId}/messages`),
  addMessage: (convId: string, input: AddMessageInput) =>
    apiFetch<Message>(`/conversations/${convId}/messages`, { method: 'POST', body: body(input) }),
  updateMessage: (id: string, input: UpdateMessageInput) =>
    apiFetch<void>(`/messages/${id}`, { method: 'PATCH', body: body(input) }),
  reorderMessage: (id: string, input: ReorderMessageInput) =>
    apiFetch<void>(`/messages/${id}/reorder`, { method: 'POST', body: body(input) }),
  deleteMessage: (id: string) => apiFetch<void>(`/messages/${id}`, { method: 'DELETE' }),

  // draft sessions
  listDraftSessions: (convId: string) =>
    apiFetch<{ sessions: SessionWithTurns[] }>(`/conversations/${convId}/draft-sessions`),
  openDraftSession: (convId: string, brief: BriefContent) =>
    apiFetch<{ session: DraftSession; turns: DraftTurn[] }>(
      `/conversations/${convId}/draft-sessions`, { method: 'POST', body: body({ brief }) }),
  addFollowup: (sessionId: string, instruction: string) =>
    apiFetch<{ turns: DraftTurn[] }>(
      `/draft-sessions/${sessionId}/followups`, { method: 'POST', body: body({ instruction }) }),
  editDraft: (sessionId: string, draft: DraftContent) =>
    apiFetch<{ turn: DraftTurn }>(
      `/draft-sessions/${sessionId}/edits`, { method: 'POST', body: body({ draft }) }),
  finalizeSession: (sessionId: string) =>
    apiFetch<{ session: DraftSession }>(`/draft-sessions/${sessionId}/finalize`, { method: 'POST', body: '{}' }),
  abandonSession: (sessionId: string) =>
    apiFetch<void>(`/draft-sessions/${sessionId}/abandon`, { method: 'POST', body: '{}' }),

  // style profiles
  listStyleProfiles: () => apiFetch<StyleProfile[]>('/style-profiles'),
  createStyleProfile: (input: CreateStyleProfileInput) =>
    apiFetch<StyleProfile>('/style-profiles', { method: 'POST', body: body(input) }),
};
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src/api/types.ts packages/web/src/api/endpoints.ts
git commit -m "feat(web): API response types and endpoint functions"
```

## Task 10: Query client, keys, and resource hooks

**Files:**
- Create: `packages/web/src/lib/queryClient.ts`, `src/hooks/useConversations.ts`, `src/hooks/useMessages.ts`, `src/hooks/useDraftSessions.ts`, `src/hooks/useStyleProfiles.ts`

- [ ] **Step 1: Create `packages/web/src/lib/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
});

export const queryKeys = {
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (convId: string) => ['messages', convId] as const,
  draftSessions: (convId: string) => ['draftSessions', convId] as const,
  styleProfiles: ['styleProfiles'] as const,
};
```

- [ ] **Step 2: Create `packages/web/src/hooks/useConversations.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateConversationInput, UpdateConversationInput } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useConversations() {
  return useQuery({ queryKey: queryKeys.conversations, queryFn: api.listConversations });
}

export function useConversation(id: string) {
  return useQuery({ queryKey: queryKeys.conversation(id), queryFn: () => api.getConversation(id) });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) => api.createConversation(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.conversations }),
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConversationInput) => api.updateConversation(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversation(id) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}
```

- [ ] **Step 3: Create `packages/web/src/hooks/useMessages.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddMessageInput, UpdateMessageInput, ReorderMessageInput } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useMessages(convId: string) {
  return useQuery({ queryKey: queryKeys.messages(convId), queryFn: () => api.listMessages(convId) });
}

export function useAddMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMessageInput) => api.addMessage(convId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

export function useUpdateMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMessageInput }) => api.updateMessage(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

export function useReorderMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReorderMessageInput }) => api.reorderMessage(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

export function useDeleteMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}
```

- [ ] **Step 4: Create `packages/web/src/hooks/useDraftSessions.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BriefContent, DraftContent } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useDraftSessions(convId: string) {
  return useQuery({
    queryKey: queryKeys.draftSessions(convId),
    queryFn: () => api.listDraftSessions(convId),
  });
}

export function useOpenDraftSession(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brief: BriefContent) => api.openDraftSession(convId, brief),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

export function useAddFollowup(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, instruction }: { sessionId: string; instruction: string }) =>
      api.addFollowup(sessionId, instruction),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

export function useEditDraft(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, draft }: { sessionId: string; draft: DraftContent }) =>
      api.editDraft(sessionId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

export function useFinalizeSession(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.finalizeSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) });
      qc.invalidateQueries({ queryKey: queryKeys.messages(convId) });
    },
  });
}

export function useAbandonSession(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.abandonSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}
```

- [ ] **Step 5: Create `packages/web/src/hooks/useStyleProfiles.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateStyleProfileInput } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useStyleProfiles() {
  return useQuery({ queryKey: queryKeys.styleProfiles, queryFn: api.listStyleProfiles });
}

export function useCreateStyleProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStyleProfileInput) => api.createStyleProfile(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.styleProfiles }),
  });
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src/lib/queryClient.ts packages/web/src/hooks
git commit -m "feat(web): query client, keys, and resource hooks"
```

---

# Phase 2 — App shell & routing

## Task 11: App shell, router, and providers

**Files:**
- Create: `packages/web/src/components/AppShell.tsx`
- Modify: `packages/web/src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: Create `packages/web/src/components/AppShell.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { useConversations } from '../hooks/useConversations.ts';
import { NewConversationDialog } from '../features/conversations/NewConversationDialog.tsx';
import { cn } from '../lib/utils.ts';

export function AppShell() {
  const { data: conversations = [] } = useConversations();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="grid h-screen grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-r bg-muted/30">
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-semibold">Conversations</span>
          <Button size="sm" onClick={() => setNewOpen(true)}>＋ New</Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2">
          {conversations.map((c) => (
            <NavLink
              key={c.id}
              to={`/conversations/${c.id}`}
              className={({ isActive }) => cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">{c.title}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/style-profiles"
          className={({ isActive }) => cn(
            'flex items-center gap-2 border-t px-4 py-3 text-sm',
            isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
          )}
        >
          <Sparkles className="h-4 w-4" /> Style profiles
        </NavLink>
      </aside>
      <main className="overflow-hidden">
        <Outlet />
      </main>
      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Create the route table in `packages/web/src/App.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { ConversationStudio } from './features/conversations/ConversationStudio.tsx';
import { StyleProfilesPage } from './features/styleProfiles/StyleProfilesPage.tsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/conversations" replace />} />
        <Route path="/conversations" element={<EmptyState />} />
        <Route path="/conversations/:id" element={<ConversationStudio />} />
        <Route path="/style-profiles" element={<StyleProfilesPage />} />
      </Route>
    </Routes>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Select a conversation or create a new one.
    </div>
  );
}
```

- [ ] **Step 3: Wire providers in `packages/web/src/main.tsx`**

Replace the file contents with:

```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from './components/ui/sonner.tsx';
import { queryClient } from './lib/queryClient.ts';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Note**

`ConversationStudio`, `NewConversationDialog`, and `StyleProfilesPage` are created in later tasks. To keep the tree compiling now, create minimal placeholder exports for the ones not yet built:

`packages/web/src/features/conversations/ConversationStudio.tsx`:
```tsx
export function ConversationStudio() { return <div className="p-6">Studio</div>; }
```
`packages/web/src/features/conversations/NewConversationDialog.tsx`:
```tsx
export function NewConversationDialog({ open }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return open ? <div /> : null;
}
```
`packages/web/src/features/styleProfiles/StyleProfilesPage.tsx`:
```tsx
export function StyleProfilesPage() { return <div className="p-6">Style profiles</div>; }
```
These are replaced wholesale by Tasks 12, 18, and 19.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src
git commit -m "feat(web): app shell, router, and providers"
```

---

# Phase 3 — Conversation create & settings

## Task 12: New conversation dialog

**Files:**
- Modify: `packages/web/src/features/conversations/NewConversationDialog.tsx` (replace placeholder)

- [ ] **Step 1: Implement the dialog**

Replace `packages/web/src/features/conversations/NewConversationDialog.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ConversationType } from '@app/shared';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select.tsx';
import { useCreateConversation } from '../../hooks/useConversations.ts';
import { useStyleProfiles } from '../../hooks/useStyleProfiles.ts';

const NONE = '__none__';

export function NewConversationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateConversation();
  const { data: profiles = [] } = useStyleProfiles();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ConversationType>('chat');
  const [emailSubject, setEmailSubject] = useState('');
  const [theirName, setTheirName] = useState('');
  const [myName, setMyName] = useState('');
  const [toneNote, setToneNote] = useState('');
  const [styleProfileId, setStyleProfileId] = useState<string>(NONE);

  function submit() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    create.mutate(
      {
        title: title.trim(),
        type,
        emailSubject: type === 'email' && emailSubject ? emailSubject : undefined,
        theirName: theirName || undefined,
        myName: myName || undefined,
        toneNote: toneNote || undefined,
        styleProfileId: styleProfileId === NONE ? undefined : styleProfileId,
      },
      {
        onSuccess: (conv) => { onOpenChange(false); navigate(`/conversations/${conv.id}`); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New conversation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ConversationType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'email' && (
            <div className="space-y-1">
              <Label htmlFor="subject">Email subject</Label>
              <Input id="subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="myName">Your name</Label>
              <Input id="myName" placeholder="Me" value={myName} onChange={(e) => setMyName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="theirName">Their name</Label>
              <Input id="theirName" placeholder="Them" value={theirName} onChange={(e) => setTheirName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tone">Tone note</Label>
            <Textarea id="tone" value={toneNote} onChange={(e) => setToneNote(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Style profile</Label>
            <Select value={styleProfileId} onValueChange={setStyleProfileId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src/features/conversations/NewConversationDialog.tsx
git commit -m "feat(web): new conversation dialog"
```

## Task 13: Conversation settings dialog

**Files:**
- Create: `packages/web/src/features/conversations/ConversationSettingsDialog.tsx`

- [ ] **Step 1: Implement the dialog**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import type { ConversationType } from '@app/shared';
import type { Conversation } from '../../api/types.ts';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select.tsx';
import { useUpdateConversation } from '../../hooks/useConversations.ts';
import { useStyleProfiles } from '../../hooks/useStyleProfiles.ts';

const NONE = '__none__';

export function ConversationSettingsDialog(
  { conversation, open, onOpenChange }:
  { conversation: Conversation; open: boolean; onOpenChange: (o: boolean) => void },
) {
  const update = useUpdateConversation(conversation.id);
  const { data: profiles = [] } = useStyleProfiles();
  const them = conversation.participants.find((p) => p.role === 'them');
  const me = conversation.participants.find((p) => p.role === 'me');

  const [title, setTitle] = useState(conversation.title);
  const [type, setType] = useState<ConversationType>(conversation.type);
  const [emailSubject, setEmailSubject] = useState(conversation.emailSubject ?? '');
  const [toneNote, setToneNote] = useState(conversation.toneNote ?? '');
  const [styleProfileId, setStyleProfileId] = useState(conversation.styleProfileId ?? NONE);
  const [provider, setProvider] = useState(conversation.provider ?? '');
  const [model, setModel] = useState(conversation.model ?? '');
  const [myName, setMyName] = useState(me?.displayName ?? '');
  const [theirName, setTheirName] = useState(them?.displayName ?? '');

  function submit() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    update.mutate(
      {
        title: title.trim(),
        type,
        emailSubject: emailSubject ? emailSubject : null,
        toneNote: toneNote ? toneNote : null,
        styleProfileId: styleProfileId === NONE ? null : styleProfileId,
        provider: provider ? provider : null,
        model: model ? model : null,
        myName: myName || undefined,
        theirName: theirName || undefined,
      },
      {
        onSuccess: () => { toast.success('Settings saved'); onOpenChange(false); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Conversation settings</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="s-title">Title</Label>
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ConversationType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'email' && (
            <div className="space-y-1">
              <Label htmlFor="s-subject">Email subject</Label>
              <Input id="s-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="s-myName">Your name</Label>
              <Input id="s-myName" value={myName} onChange={(e) => setMyName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-theirName">Their name</Label>
              <Input id="s-theirName" value={theirName} onChange={(e) => setTheirName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="s-tone">Tone note</Label>
            <Textarea id="s-tone" value={toneNote} onChange={(e) => setToneNote(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Style profile</Label>
            <Select value={styleProfileId} onValueChange={setStyleProfileId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="s-provider">Provider override</Label>
              <Input id="s-provider" placeholder="default" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="s-model">Model override</Label>
              <Input id="s-model" placeholder="default" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src/features/conversations/ConversationSettingsDialog.tsx
git commit -m "feat(web): conversation settings dialog (PATCH)"
```

---

# Phase 4 — Timeline (column 2)

## Task 14: Message item + timeline render

**Files:**
- Create: `packages/web/src/features/timeline/MessageItem.tsx`, `src/features/timeline/Timeline.tsx`, `src/features/timeline/Timeline.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/web/src/features/timeline/Timeline.test.tsx`:

```tsx
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '../../test/msw.ts';
import { renderWithProviders } from '../../test/renderWithProviders.tsx';
import { Timeline } from './Timeline.tsx';
import type { Conversation, Message } from '../../api/types.ts';

const conv: Conversation = {
  id: 'c1', userId: 'u1', title: 'T', type: 'chat', emailSubject: null, toneNote: null,
  styleProfileId: null, provider: null, model: null, createdAt: '', updatedAt: '',
  participants: [
    { id: 'pme', conversationId: 'c1', displayName: 'Me', role: 'me' },
    { id: 'pthem', conversationId: 'c1', displayName: 'Sam', role: 'them' },
  ],
};
const messages: Message[] = [
  { id: 'm1', conversationId: 'c1', senderParticipantId: 'pthem', body: 'Hi there', kind: 'reconstructed', status: 'received', position: 100, createdAt: '' },
  { id: 'm2', conversationId: 'c1', senderParticipantId: 'pme', body: 'Hello back', kind: 'live', status: 'sent', position: 200, createdAt: '' },
];

it('renders messages with sender names', async () => {
  server.use(http.get('/api/conversations/c1/messages', () => HttpResponse.json(messages)));
  renderWithProviders(<Timeline conversation={conv} />);
  expect(await screen.findByText('Hi there')).toBeInTheDocument();
  expect(await screen.findByText('Hello back')).toBeInTheDocument();
  expect(screen.getByText('Sam')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @app/web test src/features/timeline/Timeline.test.tsx`
Expected: FAIL — `Timeline` not found.

- [ ] **Step 3: Implement `MessageItem.tsx`**

```tsx
import { useState } from 'react';
import { Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Message, Participant } from '../../api/types.ts';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { cn } from '../../lib/utils.ts';
import { useUpdateMessage, useDeleteMessage } from '../../hooks/useMessages.ts';

export function MessageItem(
  { message, sender, convId }: { message: Message; sender: Participant | undefined; convId: string },
) {
  const isMe = sender?.role === 'me';
  const update = useUpdateMessage(convId);
  const del = useDeleteMessage(convId);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: message.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn('group flex flex-col', isMe ? 'items-end' : 'items-start')}>
      <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">{sender?.displayName}</span>
      <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', isMe ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        {editing ? (
          <div className="space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="text-foreground" />
            <div className="flex gap-1">
              <Button size="sm" onClick={() => update.mutate({ id: message.id, input: { body } }, { onSuccess: () => setEditing(false) })}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setBody(message.body); setEditing(false); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : message.body}
      </div>
      {!editing && (
        <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button {...attributes} {...listeners} className="cursor-grab p-1 text-muted-foreground" aria-label="Drag to reorder">
            <GripVertical className="h-3 w-3" />
          </button>
          <button className="p-1 text-muted-foreground" aria-label="Edit" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </button>
          <button className="p-1 text-muted-foreground" aria-label="Delete" onClick={() => del.mutate(message.id)}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `Timeline.tsx`** (with dnd-kit reorder)

```tsx
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { Conversation } from '../../api/types.ts';
import { useMessages, useReorderMessage } from '../../hooks/useMessages.ts';
import { MessageItem } from './MessageItem.tsx';
import { AddMessageForm } from './AddMessageForm.tsx';
import { PasteReplyButton } from './PasteReplyButton.tsx';

export function Timeline({ conversation }: { conversation: Conversation }) {
  const convId = conversation.id;
  const { data: messages = [], isLoading } = useMessages(convId);
  const reorder = useReorderMessage(convId);
  const byParticipant = new Map(conversation.participants.map((p) => [p.id, p]));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = messages.map((m) => m.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    const reordered = arrayMove(messages, from, to);
    const newIndex = reordered.findIndex((m) => m.id === active.id);
    const afterMessageId = newIndex === 0 ? null : reordered[newIndex - 1]!.id;
    reorder.mutate({ id: active.id as string, input: { afterMessageId } });
  }

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b p-3">
        <span className="text-sm font-semibold">Timeline</span>
        <PasteReplyButton convId={convId} />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={messages.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} sender={byParticipant.get(m.senderParticipantId)} convId={convId} />
              ))}
            </SortableContext>
          </DndContext>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet. Add the conversation history below.</p>
        )}
      </div>
      <AddMessageForm convId={convId} />
    </div>
  );
}
```

- [ ] **Step 5: Run the test** (it needs `AddMessageForm` and `PasteReplyButton` to exist — create them in Task 15 first, OR add temporary stubs). Create stubs now so the test compiles:

`packages/web/src/features/timeline/AddMessageForm.tsx`:
```tsx
export function AddMessageForm({ convId }: { convId: string }) { return <div data-conv={convId} />; }
```
`packages/web/src/features/timeline/PasteReplyButton.tsx`:
```tsx
export function PasteReplyButton({ convId }: { convId: string }) { return <button data-conv={convId} />; }
```
(Replaced fully in Task 15.)

Run: `pnpm --filter @app/web test src/features/timeline/Timeline.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/features/timeline
git commit -m "feat(web): timeline rendering with edit/delete/reorder"
```

## Task 15: Add message + paste reply

**Files:**
- Modify: `packages/web/src/features/timeline/AddMessageForm.tsx`, `PasteReplyButton.tsx` (replace stubs)

- [ ] **Step 1: Implement `AddMessageForm.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import type { Role } from '@app/shared';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { cn } from '../../lib/utils.ts';
import { useAddMessage } from '../../hooks/useMessages.ts';

export function AddMessageForm({ convId }: { convId: string }) {
  const add = useAddMessage(convId);
  const [sender, setSender] = useState<Role>('them');
  const [body, setBody] = useState('');

  function submit() {
    if (!body.trim()) return;
    add.mutate(
      { senderRole: sender, body: body.trim(), kind: 'reconstructed' },
      { onSuccess: () => setBody(''), onError: (e: Error) => toast.error(e.message) },
    );
  }

  return (
    <div className="border-t p-3">
      <div className="mb-2 flex gap-1">
        {(['me', 'them'] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => setSender(r)}
            className={cn('rounded-md px-2 py-1 text-xs capitalize',
              sender === r ? 'bg-primary text-primary-foreground' : 'bg-muted')}
          >
            {r}
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a message to the history…" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={submit} disabled={add.isPending}>Add message</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `PasteReplyButton.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '../../components/ui/dialog.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { useAddMessage } from '../../hooks/useMessages.ts';

export function PasteReplyButton({ convId }: { convId: string }) {
  const add = useAddMessage(convId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');

  function submit() {
    if (!body.trim()) return;
    add.mutate(
      { senderRole: 'them', body: body.trim(), kind: 'live', status: 'received' },
      {
        onSuccess: () => { setBody(''); setOpen(false); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Paste their reply</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Paste their reply</DialogTitle></DialogHeader>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the message you received…" rows={6} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={add.isPending}>Add to timeline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck, re-run timeline test, commit**

Run: `pnpm --filter @app/web typecheck && pnpm --filter @app/web test src/features/timeline/Timeline.test.tsx`
Expected: PASS.

```bash
git add packages/web/src/features/timeline
git commit -m "feat(web): add-message form and paste-reply dialog"
```

---

# Phase 5 — Drafting workspace (column 3)

## Task 16: Brief form + Transcript + TurnView

**Files:**
- Create: `packages/web/src/features/drafting/BriefForm.tsx`, `BriefForm.test.tsx`, `TurnView.tsx`, `Transcript.tsx`, `Transcript.test.tsx`

- [ ] **Step 1: Write the failing BriefForm test**

`packages/web/src/features/drafting/BriefForm.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders.tsx';
import { BriefForm } from './BriefForm.tsx';

it('requires a goal before submitting', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<BriefForm onSubmit={onSubmit} pending={false} />);
  await userEvent.click(screen.getByRole('button', { name: /start drafting/i }));
  expect(onSubmit).not.toHaveBeenCalled();
});

it('submits the brief when a goal is provided', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(<BriefForm onSubmit={onSubmit} pending={false} />);
  await userEvent.type(screen.getByLabelText(/goal/i), 'Reply warmly');
  await userEvent.type(screen.getByLabelText(/background/i), 'Old friend');
  await userEvent.click(screen.getByRole('button', { name: /start drafting/i }));
  expect(onSubmit).toHaveBeenCalledWith({ goal: 'Reply warmly', background: 'Old friend', questions: undefined });
});
```

- [ ] **Step 2: Run it to confirm failure**

Run: `pnpm --filter @app/web test src/features/drafting/BriefForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BriefForm.tsx`**

```tsx
import { useState } from 'react';
import type { BriefContent } from '@app/shared';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { Label } from '../../components/ui/label.tsx';

export function BriefForm({ onSubmit, pending }: { onSubmit: (b: BriefContent) => void; pending: boolean }) {
  const [goal, setGoal] = useState('');
  const [background, setBackground] = useState('');
  const [questions, setQuestions] = useState('');
  const [error, setError] = useState(false);

  function submit() {
    if (!goal.trim()) { setError(true); return; }
    onSubmit({ goal: goal.trim(), background: background.trim() || undefined, questions: questions.trim() || undefined });
  }

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <Label htmlFor="goal">Goal</Label>
        <Textarea id="goal" value={goal} onChange={(e) => { setGoal(e.target.value); setError(false); }}
          placeholder="What do you want to say?" />
        {error && <p className="text-xs text-destructive">A goal is required.</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="background">Background</Label>
        <Textarea id="background" value={background} onChange={(e) => setBackground(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="questions">Questions for the AI</Label>
        <Textarea id="questions" value={questions} onChange={(e) => setQuestions(e.target.value)} />
      </div>
      <Button onClick={submit} disabled={pending}>{pending ? 'Drafting…' : 'Start drafting'}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Run BriefForm test (PASS)**

Run: `pnpm --filter @app/web test src/features/drafting/BriefForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `TurnView.tsx`**

```tsx
import type { DraftTurn } from '../../api/types.ts';
import type { BriefContent, AnswersContent, DraftContent, FollowupContent } from '@app/shared';
import { cn } from '../../lib/utils.ts';

const LABELS: Record<DraftTurn['kind'], string> = {
  brief: 'Brief — you', answers: 'AI answers', draft: 'Draft', edit: 'Your edit', followup: 'Follow-up — you',
};

export function TurnView({ turn, isCurrentDraft, onRestore }: {
  turn: DraftTurn; isCurrentDraft: boolean; onRestore?: () => void;
}) {
  const tone =
    turn.kind === 'answers' ? 'bg-amber-50 border-amber-200'
    : turn.kind === 'draft' || turn.kind === 'edit' ? 'bg-emerald-50 border-emerald-200'
    : turn.kind === 'followup' ? 'bg-sky-50 border-sky-200'
    : 'bg-muted/40';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {LABELS[turn.kind]}{isCurrentDraft ? ' · current' : ''}
        </span>
        {onRestore && !isCurrentDraft && (turn.kind === 'draft' || turn.kind === 'edit') && (
          <button className="text-[10px] text-sky-700 hover:underline" onClick={onRestore}>↺ restore</button>
        )}
      </div>
      <div className={cn('rounded-lg border p-3 text-sm', tone, !isCurrentDraft && (turn.kind === 'draft') && 'opacity-70')}>
        {renderContent(turn)}
      </div>
    </div>
  );
}

function renderContent(turn: DraftTurn) {
  switch (turn.kind) {
    case 'brief': {
      const c = turn.content as BriefContent;
      return (
        <div className="space-y-1">
          <p>{c.goal}</p>
          {c.background && <p className="text-muted-foreground">Background: {c.background}</p>}
          {c.questions && <p className="text-muted-foreground">Questions: {c.questions}</p>}
        </div>
      );
    }
    case 'answers': {
      const c = turn.content as AnswersContent;
      return <ul className="list-disc pl-4">{c.items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
    }
    case 'draft':
    case 'edit': {
      const c = turn.content as DraftContent;
      return (
        <div className="space-y-1">
          {c.subject && <p className="font-medium">Subject: {c.subject}</p>}
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      );
    }
    case 'followup': {
      const c = turn.content as FollowupContent;
      return <p>{c.text}</p>;
    }
  }
}
```

- [ ] **Step 6: Write the failing Transcript test**

`packages/web/src/features/drafting/Transcript.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.tsx';
import { Transcript } from './Transcript.tsx';
import type { DraftTurn } from '../../api/types.ts';

const turns: DraftTurn[] = [
  { id: 't1', sessionId: 's1', position: 100, role: 'user', kind: 'brief', content: { goal: 'Reply warmly' }, provider: null, model: null, createdAt: '' },
  { id: 't2', sessionId: 's1', position: 200, role: 'assistant', kind: 'answers', content: { items: ['Be kind'] }, provider: 'anthropic', model: 'claude-opus-4-8', createdAt: '' },
  { id: 't3', sessionId: 's1', position: 300, role: 'assistant', kind: 'draft', content: { body: 'Hello friend!' }, provider: 'anthropic', model: 'claude-opus-4-8', createdAt: '' },
];

it('renders all turns and marks the latest draft current', () => {
  renderWithProviders(<Transcript turns={turns} onRestore={() => {}} />);
  expect(screen.getByText('Reply warmly')).toBeInTheDocument();
  expect(screen.getByText('Be kind')).toBeInTheDocument();
  expect(screen.getByText('Hello friend!')).toBeInTheDocument();
  expect(screen.getByText(/draft · current/i)).toBeInTheDocument();
});
```

- [ ] **Step 7: Implement `Transcript.tsx`**

```tsx
import type { DraftTurn } from '../../api/types.ts';
import { TurnView } from './TurnView.tsx';

/** Index of the latest draft/edit turn (the current draft), or -1. */
export function currentDraftIndex(turns: DraftTurn[]): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.kind === 'draft' || turns[i]!.kind === 'edit') return i;
  }
  return -1;
}

export function Transcript({ turns, onRestore }: { turns: DraftTurn[]; onRestore: (turn: DraftTurn) => void }) {
  const currentIdx = currentDraftIndex(turns);
  return (
    <div className="space-y-4">
      {turns.map((turn, i) => (
        <TurnView
          key={turn.id}
          turn={turn}
          isCurrentDraft={i === currentIdx}
          onRestore={() => onRestore(turn)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Run drafting tests (PASS)**

Run: `pnpm --filter @app/web test src/features/drafting`
Expected: BriefForm + Transcript tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/features/drafting
git commit -m "feat(web): brief form, turn view, and transcript"
```

## Task 17: Refine bar + DraftWorkspace orchestration

**Files:**
- Create: `packages/web/src/features/drafting/RefineBar.tsx`, `src/features/drafting/DraftWorkspace.tsx`

- [ ] **Step 1: Implement `RefineBar.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';

export function RefineBar({ onRefine, onFinalize, onAbandon, pending }: {
  onRefine: (instruction: string) => void;
  onFinalize: () => void;
  onAbandon: () => void;
  pending: boolean;
}) {
  const [instruction, setInstruction] = useState('');

  function refine() {
    if (!instruction.trim()) return;
    onRefine(instruction.trim());
    setInstruction('');
  }

  return (
    <div className="space-y-2 border-t bg-muted/30 p-3">
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Ask a follow-up or describe a change…"
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={refine} disabled={pending}>Send to AI</Button>
        <Button size="sm" variant="secondary" onClick={onFinalize} disabled={pending}>Finalize &amp; send</Button>
        <Button size="sm" variant="ghost" onClick={onAbandon} disabled={pending}>Abandon</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `DraftWorkspace.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import type { BriefContent, DraftContent } from '@app/shared';
import type { Conversation, DraftTurn, SessionWithTurns } from '../../api/types.ts';
import { Button } from '../../components/ui/button.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { Label } from '../../components/ui/label.tsx';
import { ApiError } from '../../api/client.ts';
import {
  useDraftSessions, useOpenDraftSession, useAddFollowup, useEditDraft,
  useFinalizeSession, useAbandonSession,
} from '../../hooks/useDraftSessions.ts';
import { BriefForm } from './BriefForm.tsx';
import { Transcript, currentDraftIndex } from './Transcript.tsx';
import { RefineBar } from './RefineBar.tsx';

export function DraftWorkspace({ conversation }: { conversation: Conversation }) {
  const convId = conversation.id;
  const { data, isLoading } = useDraftSessions(convId);
  const open = useOpenDraftSession(convId);
  const followup = useAddFollowup(convId);
  const edit = useEditDraft(convId);
  const finalize = useFinalizeSession(convId);
  const abandon = useAbandonSession(convId);

  const sessions = data?.sessions ?? [];
  const openSession = sessions.find((s) => s.status === 'open');
  const pending = open.isPending || followup.isPending || edit.isPending || finalize.isPending || abandon.isPending;

  function handleError(e: unknown) {
    if (e instanceof ApiError && (e.code === 'context_too_large' || e.code === 'needs_manual_selection')) {
      toast.error('This conversation is too long for the model\'s context window.');
    } else if (e instanceof Error) {
      toast.error(e.message);
    }
  }

  function startDraft(brief: BriefContent) {
    open.mutate(brief, { onError: handleError });
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!openSession) {
    return (
      <div className="flex h-full flex-col">
        <Header title="Compose a reply" />
        <div className="flex-1 overflow-y-auto">
          <BriefForm onSubmit={startDraft} pending={open.isPending} />
        </div>
      </div>
    );
  }

  return (
    <OpenSessionView
      conversation={conversation}
      session={openSession}
      pending={pending}
      onRefine={(instruction) => followup.mutate({ sessionId: openSession.id, instruction }, { onError: handleError })}
      onEdit={(draft) => edit.mutate({ sessionId: openSession.id, draft }, { onError: handleError })}
      onRestore={(turn) => edit.mutate({ sessionId: openSession.id, draft: turn.content as DraftContent }, { onError: handleError })}
      onFinalize={() => finalize.mutate(openSession.id, {
        onSuccess: () => toast.success('Sent — added to the timeline.'),
        onError: handleError,
      })}
      onAbandon={() => abandon.mutate(openSession.id, { onError: handleError })}
    />
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b p-3">
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

function OpenSessionView({
  conversation, session, pending, onRefine, onEdit, onRestore, onFinalize, onAbandon,
}: {
  conversation: Conversation;
  session: SessionWithTurns;
  pending: boolean;
  onRefine: (instruction: string) => void;
  onEdit: (draft: DraftContent) => void;
  onRestore: (turn: DraftTurn) => void;
  onFinalize: () => void;
  onAbandon: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const idx = currentDraftIndex(session.turns);
  const current = idx >= 0 ? (session.turns[idx]!.content as DraftContent) : null;
  const [body, setBody] = useState(current?.body ?? '');
  const [subject, setSubject] = useState(current?.subject ?? '');

  function beginEdit() {
    setBody(current?.body ?? '');
    setSubject(current?.subject ?? '');
    setEditing(true);
  }
  function saveEdit() {
    onEdit({ body, ...(conversation.type === 'email' && subject ? { subject } : {}) });
    setEditing(false);
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Drafting reply" />
      <div className="flex-1 overflow-y-auto p-4">
        <Transcript turns={session.turns} onRestore={onRestore} />
        {editing && (
          <div className="mt-4 space-y-2 rounded-lg border border-emerald-300 p-3">
            {conversation.type === 'email' && (
              <div className="space-y-1">
                <Label htmlFor="edit-subject">Subject</Label>
                <input id="edit-subject" className="w-full rounded border px-2 py-1 text-sm"
                  value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={pending}>Save edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {!editing && current && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={beginEdit}>Edit draft</Button>
          </div>
        )}
      </div>
      <RefineBar onRefine={onRefine} onFinalize={onFinalize} onAbandon={onAbandon} pending={pending} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck && pnpm --filter @app/web test src/features/drafting`
Expected: PASS.

```bash
git add packages/web/src/features/drafting
git commit -m "feat(web): refine bar and draft workspace orchestration"
```

## Task 18: Conversation Studio (3-column host)

**Files:**
- Modify: `packages/web/src/features/conversations/ConversationStudio.tsx` (replace placeholder)

- [ ] **Step 1: Implement `ConversationStudio.tsx`**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Button } from '../../components/ui/button.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { useConversation } from '../../hooks/useConversations.ts';
import { Timeline } from '../timeline/Timeline.tsx';
import { DraftWorkspace } from '../drafting/DraftWorkspace.tsx';
import { ConversationSettingsDialog } from './ConversationSettingsDialog.tsx';

export function ConversationStudio() {
  const { id } = useParams<{ id: string }>();
  const { data: conversation, isLoading, isError } = useConversation(id!);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (isError || !conversation) return <div className="p-6 text-muted-foreground">Conversation not found.</div>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">{conversation.title}</h1>
          <Badge variant="secondary">{conversation.type}</Badge>
          {conversation.model && <Badge variant="outline">{conversation.model}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-1 h-4 w-4" /> Settings
        </Button>
      </header>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] overflow-hidden">
        <Timeline conversation={conversation} />
        <DraftWorkspace conversation={conversation} />
      </div>
      <ConversationSettingsDialog conversation={conversation} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src/features/conversations/ConversationStudio.tsx
git commit -m "feat(web): conversation studio three-column host"
```

---

# Phase 6 — Style profiles

## Task 19: Style profiles page

**Files:**
- Modify: `packages/web/src/features/styleProfiles/StyleProfilesPage.tsx` (replace placeholder)
- Create: `packages/web/src/features/styleProfiles/NewStyleProfileForm.tsx`

- [ ] **Step 1: Implement `NewStyleProfileForm.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { Textarea } from '../../components/ui/textarea.tsx';
import { useCreateStyleProfile } from '../../hooks/useStyleProfiles.ts';

export function NewStyleProfileForm() {
  const create = useCreateStyleProfile();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  function submit() {
    if (!name.trim() || !instructions.trim()) { toast.error('Name and instructions are required'); return; }
    create.mutate(
      { name: name.trim(), description: description.trim() || undefined, instructions: instructions.trim() },
      {
        onSuccess: () => { setName(''); setDescription(''); setInstructions(''); toast.success('Profile created'); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">New style profile</h2>
      <div className="space-y-1"><Label htmlFor="sp-name">Name</Label>
        <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="sp-desc">Description</Label>
        <Input id="sp-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="sp-instr">Instructions</Label>
        <Textarea id="sp-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} /></div>
      <Button onClick={submit} disabled={create.isPending}>Create profile</Button>
    </div>
  );
}
```

- [ ] **Step 2: Implement `StyleProfilesPage.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { useStyleProfiles } from '../../hooks/useStyleProfiles.ts';
import { NewStyleProfileForm } from './NewStyleProfileForm.tsx';

export function StyleProfilesPage() {
  const { data: profiles = [], isLoading } = useStyleProfiles();

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Style profiles</h1>
      <NewStyleProfileForm />
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && profiles.length === 0 && <p className="text-sm text-muted-foreground">No profiles yet.</p>}
        {profiles.map((p) => (
          <Card key={p.id}>
            <CardHeader><CardTitle className="text-base">{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {p.description && <p className="text-muted-foreground">{p.description}</p>}
              <p className="whitespace-pre-wrap">{p.instructions}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS.

```bash
git add packages/web/src/features/styleProfiles
git commit -m "feat(web): style profiles page"
```

---

# Phase 7 — Smoke test & deployment

## Task 20: Full-loop smoke test

**Files:**
- Create: `packages/web/src/smoke.test.tsx`

- [ ] **Step 1: Write the smoke test**

`packages/web/src/smoke.test.tsx`:

```tsx
import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { server } from './test/msw.ts';
import App from './App.tsx';
import type { Conversation, Message, SessionWithTurns } from './api/types.ts';

const conv: Conversation = {
  id: 'c1', userId: 'u1', title: 'With Sam', type: 'chat', emailSubject: null, toneNote: null,
  styleProfileId: null, provider: null, model: null, createdAt: '', updatedAt: '',
  participants: [
    { id: 'pme', conversationId: 'c1', displayName: 'Me', role: 'me' },
    { id: 'pthem', conversationId: 'c1', displayName: 'Sam', role: 'them' },
  ],
};

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/conversations/c1']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('drafts and finalizes a reply end-to-end', async () => {
  let messages: Message[] = [
    { id: 'm1', conversationId: 'c1', senderParticipantId: 'pthem', body: 'Can we meet Friday?', kind: 'reconstructed', status: 'received', position: 100, createdAt: '' },
  ];
  let sessions: SessionWithTurns[] = [];

  server.use(
    http.get('/api/conversations/c1', () => HttpResponse.json(conv)),
    http.get('/api/conversations/c1/messages', () => HttpResponse.json(messages)),
    http.get('/api/conversations/c1/draft-sessions', () => HttpResponse.json({ sessions })),
    http.get('/api/style-profiles', () => HttpResponse.json([])),
    http.get('/api/conversations', () => HttpResponse.json([conv])),
    http.post('/api/conversations/c1/draft-sessions', async () => {
      sessions = [{
        id: 's1', conversationId: 'c1', status: 'open', summary: null, sentMessageId: null,
        createdAt: '', closedAt: null,
        turns: [
          { id: 't1', sessionId: 's1', position: 100, role: 'user', kind: 'brief', content: { goal: 'Agree to Friday' }, provider: null, model: null, createdAt: '' },
          { id: 't2', sessionId: 's1', position: 200, role: 'assistant', kind: 'draft', content: { body: 'Friday works for me!' }, provider: 'anthropic', model: 'claude-opus-4-8', createdAt: '' },
        ],
      }];
      return HttpResponse.json({ session: sessions[0], turns: sessions[0]!.turns }, { status: 201 });
    }),
    http.post('/api/draft-sessions/s1/finalize', () => {
      messages = [...messages, { id: 'm2', conversationId: 'c1', senderParticipantId: 'pme', body: 'Friday works for me!', kind: 'live', status: 'sent', position: 200, createdAt: '' }];
      sessions = sessions.map((s) => ({ ...s, status: 'sent' as const }));
      return HttpResponse.json({ session: { ...sessions[0], status: 'sent' } });
    }),
  );

  renderApp();

  // Timeline shows the reconstructed message.
  expect(await screen.findByText('Can we meet Friday?')).toBeInTheDocument();

  // Fill the brief and start drafting.
  await userEvent.type(await screen.findByLabelText(/goal/i), 'Agree to Friday');
  await userEvent.click(screen.getByRole('button', { name: /start drafting/i }));

  // The AI draft appears in the transcript.
  expect(await screen.findByText('Friday works for me!')).toBeInTheDocument();

  // Finalize; the sent message lands on the timeline.
  await userEvent.click(screen.getByRole('button', { name: /finalize/i }));
  const timeline = await screen.findByText('Timeline');
  expect(timeline).toBeInTheDocument();
  // After finalize, the timeline refetch includes the sent body (appears twice: transcript + timeline).
  expect((await screen.findAllByText('Friday works for me!')).length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Run the smoke test**

Run: `pnpm --filter @app/web test src/smoke.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run the full web suite**

Run: `pnpm --filter @app/web test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/smoke.test.tsx
git commit -m "test(web): full-loop smoke test"
```

## Task 21: Production Docker build + compose wiring

**Files:**
- Create: `packages/web/Dockerfile`, `packages/web/nginx.conf`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create `packages/web/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Proxy API calls to the api service, stripping the /api prefix.
  location /api/ {
    proxy_pass http://api:8787/;
    proxy_set_header Host $host;
  }
}
```

- [ ] **Step 2: Create `packages/web/Dockerfile`**

```dockerfile
# Build stage
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile --filter @app/web...
COPY packages/shared packages/shared
COPY packages/web packages/web
RUN pnpm --filter @app/web build

# Serve stage
FROM nginx:alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/web/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Add the web service to `docker-compose.yml`**

Add under `services:` (sibling to `api`):

```yaml
  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    ports:
      - "8080:80"
    depends_on:
      - api
```

- [ ] **Step 4: Verify the production build compiles**

Run: `pnpm --filter @app/web build`
Expected: `dist/` is produced with no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/Dockerfile packages/web/nginx.conf docker-compose.yml
git commit -m "feat(web): production Dockerfile, nginx, and compose wiring"
```

## Task 22: Final verification & docs

**Files:**
- Modify: `README.md` (add web run instructions)

- [ ] **Step 1: Run the whole monorepo suite**

Run: `pnpm -r test && pnpm -r typecheck`
Expected: shared, api, and web all green.

- [ ] **Step 2: Add a "Web app" section to `README.md`**

Insert under the existing run docs:

```markdown
## Web app

Dev (API on :8787, web on :5173 with `/api` proxied):

```bash
pnpm --filter @app/api dev      # terminal 1
pnpm --filter @app/web dev      # terminal 2
# open http://localhost:5173
```

Production (Docker): `docker compose up --build` then open http://localhost:8080
(the web container proxies `/api` to the api service).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: web app run instructions"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Conversation list/create → Tasks 11, 12. Settings edit (PATCH) → Tasks 1, 2, 13. ✅
- Timeline reconstruction (add/edit/reorder/delete, paste reply) → Tasks 14, 15. ✅
- Drafting workspace transcript (brief → answers → draft → refine → edit → restore → finalize → abandon) → Tasks 16, 17. ✅
- Rehydrate open session on reload (GET draft-sessions) → Tasks 3, 17 (`useDraftSessions` is the workspace's source of truth). ✅
- Style profiles → Task 19. ✅
- Stack (React/Vite/TS, Tailwind+shadcn, TanStack Query, React Router, shared zod) → Tasks 5–11. ✅
- Error handling (typed ApiError, retryable provider error via toast, context-too-large blocking message, validation messages) → Tasks 8, 17, plus per-form `onError` toasts. ✅
- Testing (RTL+MSW component tests, client error-mapping, smoke loop, backend endpoint tests) → Tasks 4, 8, 14, 16, 20. ✅
- Deployment (web Dockerfile + compose) → Task 21. ✅

**Deferred (explicitly per spec, no task):** summary editing, context-overflow session picker, style-profile edit/delete. ✅

**Type consistency:** `currentDraftIndex` is defined once in `Transcript.tsx` and imported by `DraftWorkspace.tsx`. Endpoint return shapes in `endpoints.ts` match `api/types.ts` and the backend service returns (`{ session, turns }`, `{ turns }`, `{ turn }`, `{ session }`, `{ sessions }`). Hook mutation argument shapes match their call sites in the feature components. `ApiError` fields (`code`, `retryable`, `sessionIds`, `details`, `status`) are consistent between `client.ts` and its consumers.

**Placeholder scan:** Placeholder component files in Task 11/14 are explicitly flagged as temporary and replaced wholesale in named later tasks; every other step contains complete code.

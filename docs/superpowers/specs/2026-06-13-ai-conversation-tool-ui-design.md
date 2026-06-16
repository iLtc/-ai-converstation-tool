# AI Conversation Drafting Tool — Web UI Design

**Date:** 2026-06-13
**Status:** Approved (design); pending implementation plan
**Backend spec:** [2026-06-12-ai-conversation-drafting-tool-design.md](./2026-06-12-ai-conversation-drafting-tool-design.md)

## Overview

The web UI for the AI conversation drafting tool. The backend (API server,
providers, persistence, context assembly) is complete; this design covers the
React single-page app that drives it. It is the **full app** for the current
single-user scope: conversation list and creation, conversation reconstruction
(add/edit/reorder/delete messages), the drafting workspace (brief → AI
answers + draft → multi-round refine → finalize), and style-profile management.

The app realizes the backend's **two-layer model** visually: the real
conversation timeline (`messages`) on one side, the private drafting session
(`draft_turns`) on the other, kept distinct so the user always knows what is
"real" versus what is being drafted.

## Goals

- Browse, create, and configure conversations.
- Reconstruct an existing conversation (add messages per party, edit, reorder,
  delete) and paste the other party's live replies.
- Run the full drafting loop: brief → AI answers + draft → follow-ups, manual
  edits, and revert to any prior draft version → finalize & send.
- Show the AI's reasoning trail (answers + every draft version) faithfully,
  mirroring the append-only `draft_turns` log.
- Manage reusable style profiles.
- Edit conversation settings after creation.
- Surface provider/context errors clearly with retry where the backend allows.
- Rehydrate an open draft session on page reload.

## Non-Goals (YAGNI for now)

- **Summary editing** — the backend generates summaries but exposes no update
  endpoint; summaries are shown read-only. Deferred.
- **Context-overflow session picker** — when context cannot fit even with all
  priors summarized, the backend cannot retry with a chosen subset (no
  inclusion parameter). The UI shows a clear blocking message instead. Deferred,
  consistent with the backend spec's own deferral (conversations expected short).
- **Auth UI** — handled by the external reverse proxy; the app assumes the
  single constant `user_id`.
- **Streaming AI responses** — the backend returns complete responses; the UI
  shows a loading state per round.
- **Multi-party rendering** — two-party only, matching current backend scope.

## Architecture

A new `packages/web` workspace alongside `packages/api` and `packages/shared`.

- **React + Vite + TypeScript** single-page app.
- **Tailwind CSS + shadcn/ui** — shadcn component sources copied into
  `src/components/ui/` (owned, editable; Radix-based accessibility).
- **TanStack Query** for all server state (caching, loading/error states,
  invalidation after mutations).
- **React Router** for client-side routing (shareable URLs, back/forward).
- **`@app/shared`** zod schemas/types reused for request/response DTOs so the
  client and server agree on shapes by construction.
- **Typed API client** (`src/api/client.ts`) wrapping `fetch`: serializes
  requests, parses the `{ error: { code, message, ... } }` envelope into typed
  error objects carrying `code`, `message`, and the subclass extras
  (`retryable`, `sessionIds`, `details`).
- **`packages/web/Dockerfile`** added and wired into `docker-compose.yml`. In
  dev, the Vite dev server proxies `/api` to the API server.

### Project structure

```
packages/web/
  src/
    main.tsx                 # React root, providers (QueryClient, Router)
    App.tsx                  # route table + app shell
    api/
      client.ts              # typed fetch wrapper + error mapping
      endpoints.ts           # per-resource request functions
    components/ui/           # shadcn components
    lib/
      queryClient.ts         # TanStack Query client + query keys
    features/
      conversations/         # list, create dialog, settings dialog, detail/studio shell
      timeline/              # timeline, message item, add/edit/reorder controls
      drafting/              # workspace, brief form, transcript, turn views, refine bar
      styleProfiles/         # list + create form
  Dockerfile
  vite.config.ts
  index.html
```

## Routing & App Shell

| Route | View |
|-------|------|
| `/` | redirect → `/conversations` |
| `/conversations` | conversation list in the rail; empty main area prompt |
| `/conversations/:id` | **Studio** screen (rail + timeline + drafting workspace) |
| `/style-profiles` | rail + style-profile management in the main area |

The **left rail (column 1)** is part of the shell and always visible: the
conversation list (active item highlighted), a **"＋ New conversation"** button,
and a link to **Style profiles**. New-conversation is a **modal dialog**, not a
route.

## Screens

### Conversation list (rail)

- Lists conversations (`GET /conversations`): title, a type icon (chat/email),
  ordered by `updated_at`. Active conversation highlighted.
- **New conversation** modal (`POST /conversations`): title (required), type
  (chat/email), email subject (shown when type = email), their name, my name,
  tone note, style profile (select from `GET /style-profiles`), and an
  **Advanced** section for provider/model override. On success, navigates to the
  new conversation.

### Studio — conversation detail (`/conversations/:id`)

Three columns. Header shows conversation title, type, the resolved
provider/model and style profile (read at creation but editable), and a
**Settings** affordance opening the settings dialog.

**Settings dialog** (`PATCH /conversations/:id`): partial update of title, type,
email subject, tone note, style profile, provider/model overrides, and
participant display names. Clearing provider/model falls back to server defaults;
clearing style profile is allowed.

#### Column 2 — real timeline

- Renders `GET /conversations/:id/messages` as me/them chat bubbles (me right,
  them left) with participant display names; `kind`/`status` shown subtly.
- **Reconstruction controls:**
  - **Add message** — sender toggle (me/them), body, position (append by
    default; insert-after a chosen message). `POST /conversations/:id/messages`.
  - **Edit** inline — `PATCH /messages/:id`.
  - **Delete** — `DELETE /messages/:id`.
  - **Reorder** — drag-to-reorder, `POST /messages/:id/reorder` with the
    `afterMessageId` (or `null` to move to front).
- **"Paste their reply"** — a prominent action that adds a `them` / `kind=live` /
  `status=received` message. This is the loop entry point after finalizing a
  reply.
- Clicking a **sent** message reveals its drafting session transcript read-only
  (from the draft-sessions read endpoint).

#### Column 3 — drafting workspace (Transcript style)

- **No open session:** empty state with a **brief form** (goal required;
  background, questions optional). Submitting opens a session
  (`POST /conversations/:id/draft-sessions`), which also runs the first AI round.
- **Loading:** while the AI runs (on open and each follow-up), show the
  user-submitted brief/follow-up immediately with an "AI is drafting…" indicator.
- **Transcript:** a vertical log of the session's turns in order — brief, AI
  answers, draft v1, follow-up, draft v2, edit, … — each turn rendered by its
  `kind`. The **newest draft** (`draft`/`edit`) is **editable in place**.
- **Actions:**
  - **Refine** — text input; `POST /draft-sessions/:id/followups` with the
    instruction. Appends a follow-up turn + the AI's new answers/draft.
  - **Edit draft** — inline edit of the current draft; `POST /draft-sessions/:id/edits`.
  - **Restore version** — pick any prior `draft`/`edit` turn; re-submits its
    content via `POST /draft-sessions/:id/edits`, creating a new edit turn that
    becomes current. Uses the existing endpoint and respects immutable turns
    (no destructive revert).
  - **Finalize & send** — `POST /draft-sessions/:id/finalize`. Writes the sent
    message into column 2, generates the summary server-side, closes the session.
  - **Abandon** — `POST /draft-sessions/:id/abandon`.
- After finalize/abandon, the workspace returns to the compose (empty) state and
  the timeline reflects the new sent message.
- **Rehydration:** on load, `GET /conversations/:id/draft-sessions` provides the
  open session and its turns so a reload mid-draft restores the transcript.

### Style profiles (`/style-profiles`)

- Lists profiles (`GET /style-profiles`): name, description.
- Create form (`POST /style-profiles`): name (required), description,
  instructions (required).
- (Edit/delete of profiles deferred — no backend endpoints; create + list only.)

## Backend Additions (part of this work)

Two endpoints are added to the existing API, with matching `@app/shared` schemas
and tests, following current route/service/test conventions.

1. **`GET /conversations/:id/draft-sessions`** — returns the conversation's draft
   sessions with their ordered turns. Used to (a) rehydrate the open session on
   reload and (b) render read-only history for past (`sent`) sessions. Abandoned
   sessions are excluded from the default UI rendering. Namespaced by `user_id`
   via the existing `getConversation` authorization.

2. **`PATCH /conversations/:id`** — partial update of conversation settings.
   New `UpdateConversationInput` (all fields optional): `title`, `type`,
   `emailSubject`, `toneNote`, `styleProfileId` (nullable to clear), `provider`
   (nullable), `model` (nullable), `theirName`, `myName`. Validates style-profile
   ownership like create, updates participant display names when provided, bumps
   `updated_at`, and returns the updated conversation (same shape as
   `GET /conversations/:id`).

No other backend changes. The context-overflow inclusion parameter and a summary
PATCH are explicitly **not** added (see Non-Goals).

## Data Layer

- **Query keys** per resource: `['conversations']`, `['conversation', id]`,
  `['messages', convId]`, `['draftSessions', convId]`, `['styleProfiles']`.
- **Mutation invalidations:**
  - add/edit/reorder/delete message → invalidate `['messages', convId]`.
  - open/followup/edit draft → invalidate `['draftSessions', convId]`.
  - finalize/abandon → invalidate `['draftSessions', convId]` **and**
    `['messages', convId]` (finalize adds a sent message).
  - create/patch conversation → invalidate `['conversations']` and
    `['conversation', id]`.
  - create style profile → invalidate `['styleProfiles']`.

## Error Handling

The API client maps the error envelope to typed errors consumed by the UI:

- **`provider_error`** (`ProviderError`, `retryable`) — inline error with a
  **Retry** action on the round that failed. Persisted turns are unaffected; if
  an *open* round fails the backend rolls the session back, so the UI keeps the
  submitted brief client-side to allow immediate resubmit.
- **`context_too_large`** / **`needs_manual_selection`** — clear blocking message
  ("This conversation is too long for the model's context"); no retry/picker
  (deferred). The `sessionIds` from `needs_manual_selection` may be listed
  informationally.
- **`validation_error`** (`details`) — inline form-field errors (the form mirrors
  the shared zod schema).
- **`conflict`** — e.g. opening a second session while one is open, or acting on
  a non-open session; shown inline (the UI normally prevents these).
- **`not_found`** — surfaced as a not-found state for the affected resource.
- Anything else → toast.

## Testing

- **Vitest + React Testing Library + MSW** (Mock Service Worker) for API mocking.
- **Component/interaction tests:**
  - Brief-form validation (goal required) and submission.
  - Transcript renders each turn `kind` correctly; newest draft editable.
  - Refine, edit, restore-version, finalize, and abandon fire the correct
    mutations against the right endpoints.
  - Timeline add/edit/reorder/delete and "paste their reply".
  - Settings dialog issues a correct `PATCH`.
  - Error states: retryable provider error shows Retry; context-too-large shows
    the blocking message; validation error shows inline field errors.
- **API-client tests:** error-envelope → typed-error mapping (including
  `retryable`, `sessionIds`, `details`).
- **Smoke test:** one MSW-backed run of the full loop (create → reconstruct →
  open session → refine → finalize → paste reply).
- **Backend additions:** unit/integration tests for the two new endpoints
  following existing API test conventions.

## Key Decisions

- **Studio (three-column) layout** — conversation list · real timeline ·
  drafting workspace all visible, so drafting always happens with the real
  conversation in view; matches the two-layer backend model.
- **Transcript drafting workspace** — the full drafting dialogue scrolls as an
  append-only log, mirroring immutable `draft_turns` and surfacing the AI's
  per-round answers, which are the tool's core value.
- **Restore = new edit turn** — reverting re-submits an old draft's content via
  `/edits` rather than mutating history, honoring turn immutability.
- **TanStack Query + React Router + shared zod** — standard server-state,
  routing, and a single source of truth for DTO shapes across client/server.
- **Two small backend additions** (draft-session read, conversation PATCH) over
  working around their absence — reload-resume and editable settings are core to
  the full-app experience.

## Open Questions / Future

- Summary editing (needs a backend update endpoint).
- Context-overflow session picker (needs an inclusion parameter end-to-end).
- Style-profile edit/delete (needs backend endpoints).
- Streaming AI responses to the transcript.
- Multi-party rendering once the backend supports it.

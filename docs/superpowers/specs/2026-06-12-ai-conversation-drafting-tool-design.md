# AI Conversation Drafting Tool — Design

**Date:** 2026-06-12
**Status:** Approved (design); pending implementation plan

## Overview

A personal tool that uses AI to help draft chat and email responses. The user
reconstructs (or starts) a conversation, describes what they want to write,
and the AI answers their questions and produces a draft. The user refines the
draft over several rounds, finalizes and sends it, then pastes the other
party's reply and repeats. Both the finalized sends and the reasoning that
produced them are preserved for future context.

Single-user for now. Authentication is handled externally by a reverse proxy;
the app reads a trusted user header and namespaces data per user so multi-user
is a non-breaking extension later.

## Goals

- Reconstruct an existing conversation or start a new one.
- Add messages attributed to either party; multiple consecutive messages from
  the same party are allowed.
- Capture a brief (what the user wants to write, background, questions).
- AI answers the user's questions first, then returns an editable draft.
- Multi-round refinement: follow-up questions, AI revisions, manual edits, with
  draft versions retained.
- On finalize: record the sent message on the conversation timeline and keep
  the full drafting transcript plus an auto-generated summary.
- Feed prior context back to the AI on later turns, preferring full transcripts
  and falling back to summaries (oldest-first) only when nearing the model's
  context limit.
- Support both Anthropic and OpenAI behind one provider interface.
- Run locally and on a Docker-based server.

## Non-Goals (YAGNI for now)

- Authentication / user management (handled by the external proxy).
- Multi-party conversations (data model is designed to allow it later).
- Full structured email modeling (to/cc lists); only a subject line is stored.
- Automatic style learning from sent messages (may layer on later).
- A native desktop app (the API is designed so one can be added later).
- Direct integration with email/chat providers (input is manual paste).

## Architecture

Three deployable pieces, all TypeScript, all containerized.

- **API server** — Node + **Hono**. REST/JSON API. No auth code; reads a
  trusted user-identity header from the proxy and namespaces all data by user.
- **Web app** — **React + Vite** single-page app, talking to the API.
- **Persistence** — **Drizzle ORM** against **SQLite** now, **Postgres**-ready
  by configuration (same schema, dialect switch via `DATABASE_URL`/driver).

### AI provider layer

A `Provider` interface with `AnthropicProvider` and `OpenAIProvider`
implementations, each using its official SDK. The interface exposes only the
operations the app needs so no other code touches a vendor SDK:

- `complete({ system, messages, model })` — returns the model's response.
- `estimateTokens(input)` — token count/estimation for context budgeting.
- Model/budget metadata (context window size per model).

Provider and model are selectable globally (config/env defaults) and overridable
per conversation.

### Deployment

- One `Dockerfile` per service (`api`, `web`).
- A `docker-compose.yml` for local and server use.
- SQLite database file lives on a mounted volume.

## Data Model

Drizzle schema. All user-owned rows carry a `user_id` for namespacing.

- **`participants`** — `id`, `conversation_id`, `display_name`,
  `role` (`me` | `them`). Two-party now; row-per-sender makes multi-party
  additive later.
- **`conversations`** — `id`, `user_id`, `title`, `type` (`chat` | `email`),
  `email_subject` (nullable), `tone_note` (per-conversation relationship/tone),
  `style_profile_id` (nullable), `provider` / `model` overrides (nullable),
  `created_at`, `updated_at`.
- **`messages`** — `id`, `conversation_id`, `sender_participant_id`, `body`,
  `kind` (`reconstructed` | `live`), `status` (`received` | `sent`),
  `position`, `created_at`. The clean real-conversation timeline. Consecutive
  same-sender messages are simply multiple rows.
- **`draft_sessions`** — `id`, `conversation_id`, `status`
  (`open` | `sent` | `abandoned`), `brief` (the user's brief/background/
  questions), `transcript` (JSON: ordered turns — brief, AI answers, draft
  versions, edits, follow-ups), `summary` (nullable, generated on send),
  `sent_message_id` (nullable until sent), `created_at`, `closed_at`.
- **`style_profiles`** — `id`, `user_id`, `name`, `description`,
  `instructions` (voice guidance), reusable across conversations.

A draft session is the private "side-thread." On finalize it writes one
`messages` row (`status = sent`) and retains its transcript + summary for
future context.

## Data Flow

### Startup / reconstruction

On open, the user either:

- **Starts new:** choose type, title, optional style profile, tone note; or
- **Reconstructs existing:** add messages one at a time, choosing the sender
  (`me` / `them`) per message (`kind = reconstructed`), multiple consecutive
  from one party allowed.

### Composing an outgoing message

1. The user opens a draft session and provides a brief + background +
   questions.
2. The server assembles the AI request:
   system prompt (style profile + tone note + type-specific guidance)
   → conversation timeline
   → prior draft-session context
   → the user's brief.
3. The AI **answers the user's questions first, then returns a draft** as one
   structured response (answers and draft separable so the UI can present them
   distinctly).
4. The user asks follow-ups, requests changes, or hand-edits the draft. Each
   round appends to the session transcript. Draft versions are retained for
   revert.
5. On **finalize**, the server writes a `sent` message to the timeline,
   generates a summary of the session, and marks the session `sent`.

### Their reply

The user pastes the reply as a `them` message, opens a new draft session, and
the loop repeats.

### Context assembly with sliding compression

Before each AI call the server estimates tokens via the provider layer. It
includes full prior draft-session transcripts when they fit. If the assembled
context exceeds the model's budget, it replaces the **oldest** full transcripts
with their summaries, one at a time, until under budget. The real message
timeline and the current session are never compressed away. If even
fully-summarized context will not fit, the UI warns and lets the user choose
which sessions to include.

## Error Handling

- **Provider failures** (rate limits, timeouts, 5xx) — typed errors from the
  provider layer, surfaced to the UI with retry. The user's brief and prior
  drafts are never lost on a failed round.
- **Context overflow** — handled by sliding compression; final fallback is a UI
  warning with manual session-inclusion control.
- **Non-destructive** — draft sessions are `abandoned`, not deleted; sent
  messages and transcripts are immutable once written.
- **Validation** — zod schemas at the API boundary (shared with the client),
  returning clear 4xx messages.

## Testing

- **Unit:** context-assembly + sliding-compression logic (pure, deterministic,
  highest-risk), schema/validation, summary triggering. Provider layer mocked.
- **Integration:** API routes against an in-memory SQLite DB — full
  "create conversation → reconstruct → draft session → finalize → next turn"
  flows.
- **Provider contract tests:** a shared suite both `AnthropicProvider` and
  `OpenAIProvider` must satisfy, against mocked SDK responses.
- Test-first (TDD) where logic is non-trivial, especially context assembly.

## Key Decisions

- **Two-layer model** (conversation timeline + draft sessions) keeps the real
  conversation cleanly separate from private AI drafting and makes selective
  summarization possible.
- **Provider abstraction** isolates Anthropic/OpenAI behind one interface.
- **SQLite via Drizzle** now, Postgres-ready, for a low-friction personal tool
  that can scale later.
- **Sliding compression** prefers fidelity (full transcripts) and degrades
  gracefully (oldest-first summaries) only under context pressure.

## Open Questions / Future

- Multi-party conversations (schema already accommodates).
- Style learning from sent messages.
- Streaming AI responses to the UI.
- Native desktop client reusing the API.

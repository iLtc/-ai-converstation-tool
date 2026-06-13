# AI Conversation Drafting Tool — Design

**Date:** 2026-06-12
**Status:** Approved (design, revised after design review); pending implementation plan

## Overview

A personal tool that uses AI to help draft chat and email responses. The user
reconstructs (or starts) a conversation, describes what they want to write,
and the AI answers their questions and produces a draft. The user refines the
draft over several rounds, finalizes and sends it, then pastes the other
party's reply and repeats. Both the finalized sends and the reasoning that
produced them are preserved for future context.

Single-user for now. Authentication is handled externally by a reverse proxy;
data is namespaced per user (via a `user_id` column) so multi-user is a
non-breaking extension later. Reading the user identity from a trusted proxy
header is deferred — a single constant `user_id` is used for now (see Decisions
from design review).

## Goals

- Reconstruct an existing conversation or start a new one.
- Add messages attributed to either party; multiple consecutive messages from
  the same party are allowed.
- Capture a brief (what the user wants to write, background, questions).
- AI answers the user's questions (optionally) first, then returns an editable
  draft, via a forced structured response.
- Multi-round refinement: follow-up questions, AI revisions, manual edits, with
  every draft version retained as an ordered turn.
- On finalize: record the sent message on the conversation timeline and keep
  the full drafting turn log plus an auto-generated, user-editable summary.
- Feed prior context back to the AI on later turns, preferring curated full
  context and falling back to summaries (oldest-first) only when nearing the
  model's context limit.
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

- **API server** — Node + **Hono**. REST/JSON API. No auth code; namespaces all
  data by `user_id` (a single constant for now; trusted-header reading deferred).
- **Web app** — **React + Vite** single-page app, talking to the API.
- **Persistence** — **Drizzle ORM** against **SQLite** now, **Postgres**-ready
  by configuration (same schema, dialect switch via `DATABASE_URL`/driver).

### AI provider layer

A `Provider` interface with `AnthropicProvider` and `OpenAIProvider`
implementations, each using its official SDK. The interface exposes only the
operations the app needs so no other code touches a vendor SDK:

- `complete({ system, messages, model, responseSchema })` — returns the model's
  response, forcing the structured `respond({ answers?, draft })` tool so both
  vendors return the same shape.
- `countTokens(input)` — token count for context budgeting. Backed by the
  provider's real token-count API (acceptable inside the compression loop given
  short conversations; see Decisions from design review).
- Model/budget metadata (context window size and `output_reserve` per model).

Provider and model are selectable globally (config/env defaults) and overridable
per conversation, and may be switched freely mid-conversation. Each AI-generated
`draft_turn` records the `provider`/`model` that produced it.

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
  same-sender messages are simply multiple rows. `position` is a **gap-based
  integer** (e.g. 100, 200, 300) so inserting-between and reordering during
  reconstruction stays local without renumbering. **All messages are freely
  editable** (including reorder/delete) — they are a manual transcription of
  history, not an immutable record.
- **`draft_sessions`** — `id`, `conversation_id`, `status`
  (`open` | `sent` | `abandoned`), `brief` (the user's brief/background/
  questions), `summary` (nullable, generated on send, user-editable),
  `sent_message_id` (nullable until sent), `created_at`, `closed_at`. The
  ordered drafting history lives in `draft_turns`, not a JSON blob.
- **`draft_turns`** — `id`, `session_id`, `position`, `role`
  (`user` | `assistant`), `kind`
  (`brief` | `answers` | `draft` | `edit` | `followup`), `content`,
  `provider` (nullable), `model` (nullable), `created_at`. The append-only
  drafting log. AI-generated turns are stamped with the `provider`/`model` that
  produced them. **`draft_turns` are immutable** — the reasoning audit trail.
  Session order across the conversation derives from the resulting sent
  message's `position` (and `created_at` for a still-open session); no explicit
  anchor column.
- **`style_profiles`** — `id`, `user_id`, `name`, `description`,
  `instructions` (voice guidance), reusable across conversations.

A draft session is the private "side-thread." On finalize it writes one
`messages` row (`status = sent`) and retains its `draft_turns` + summary for
future context. Because messages are editable, an edited `sent` message may
later drift from the `draft_turns` that produced it; the turns remain the
canonical record of what the AI actually generated.

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
   system prompt (labeled sections, general→specific: **type-specific guidance
   → style profile → tone note**, where on conflict the more specific/later
   instruction wins, so the tone note overrides the style profile)
   → conversation timeline
   → curated prior draft-session context
   → the user's brief.
3. The AI returns one **forced structured tool response**,
   `respond({ answers?, draft })` — `answers` is optional (pure-revision rounds
   need not fabricate them), `draft` is required. The provider interface's
   `complete()` takes the response schema so both vendors return the same shape;
   the UI presents answers and draft distinctly.
4. The user asks follow-ups, requests changes, or hand-edits the draft. Each
   round appends a `draft_turn`; every draft version is retained for revert.
   Revision rounds are **stateless re-sends**: the server passes the *current*
   draft (the latest `draft`/`edit` turn) as the explicit base to revise, plus
   the brief, prior answers, and the new instruction — the model is never asked
   to infer the current draft from the transcript (which breaks after a manual
   edit it did not author).
5. On **finalize**, the server writes a `sent` message to the timeline,
   generates a summary of the session (using the conversation's selected model;
   generated once, not auto-regenerated, but user-editable), and marks the
   session `sent`.

### Their reply

The user pastes the reply as a `them` message, opens a new draft session, and
the loop repeats.

### Context assembly with sliding compression

Prior draft-session context is **curated**, not the literal turn-by-turn log:
for each past session the server feeds **brief + AI answers + final draft**, and
excludes intermediate draft versions and edit churn (the actual sent message is
already on the timeline). The *current* session is always sent in full.
**Abandoned sessions are fully excluded** from future context.

Before each AI call the server counts tokens via the provider layer. The input
budget is **`context_window − output_reserve − safety_margin`** (the
`output_reserve` comes from the per-model metadata), not the raw context window,
so a long generated draft cannot push the request over the limit. It includes
full curated prior-session context when it fits. If the assembled context
exceeds the budget, it replaces the **oldest** sessions' curated context with
their summaries, one at a time, until under budget.

The real message timeline and the current session are never compressed away
(timeline compression is deferred — see Decisions from design review). If even
fully-summarized context will not fit, the UI warns and lets the user choose
which sessions to include; if the incompressible parts (timeline + current
session) alone exceed budget, the server **fails loudly** with a clear "context
too large" error rather than sending an over-budget request.

## Error Handling

- **Provider failures** (rate limits, timeouts, 5xx) — typed errors from the
  provider layer, surfaced to the UI with retry. The user's brief and prior
  drafts are never lost on a failed round.
- **Context overflow** — handled by sliding compression; fallback is a UI
  warning with manual session-inclusion control, and a loud "context too large"
  error if the incompressible parts alone exceed budget.
- **Non-destructive** — draft sessions are `abandoned`, not deleted.
  `draft_turns` are immutable once written (the reasoning audit trail);
  `messages` are freely editable.
- **Validation** — zod schemas at the API boundary (shared with the client),
  returning clear 4xx messages.

## Testing

- **Unit:** context-assembly + sliding-compression logic (curation of prior
  sessions, budget formula with output reserve, oldest-first summary swap,
  highest-risk), schema/validation, summary triggering. Provider layer mocked.
- **Integration:** API routes against an in-memory SQLite DB — full
  "create conversation → reconstruct → draft session → finalize → next turn"
  flows.
- **Provider contract tests:** a shared suite both `AnthropicProvider` and
  `OpenAIProvider` must satisfy, against mocked SDK responses.
- Test-first (TDD) where logic is non-trivial, especially context assembly.

## Key Decisions

- **Two-layer model** (conversation timeline of `messages` + draft sessions of
  `draft_turns`) keeps the real conversation cleanly separate from private AI
  drafting and makes selective summarization possible.
- **Provider abstraction** isolates Anthropic/OpenAI behind one interface, with
  forced structured output and a uniform `countTokens`.
- **SQLite via Drizzle** now, Postgres-ready, for a low-friction personal tool
  that can scale later.
- **Sliding compression** prefers fidelity (curated full context) and degrades
  gracefully (oldest-first summaries) only under context pressure.

## Decisions from design review (2026-06-12)

Decisions and deliberate deferrals from the design-review grilling, recorded so
the rationale is not lost:

- **Keep all the machinery** (three services, dual provider, Postgres-ready,
  per-user namespacing) despite the single-user scope — expansion is expected
  soon, so the abstractions earn their place now.
- **Forced structured tool output** (`respond({ answers?, draft })`) chosen over
  delimited-prose parsing or two-call separation — reliability across hundreds
  of rounds matters more than prose flexibility.
- **Normalized `draft_turns`** chosen over a single `transcript` JSON blob — the
  history is an append-only ordered log; rows make append, revert, and per-turn
  provenance natural.
- **Curated prior-session context** (brief + answers + final draft) over the
  literal full turn log — intermediate revisions are noise and can mislead the
  model toward rejected drafts.
- **Tone note overrides style profile** on conflict — the style profile is
  global base voice; the tone note is the per-relationship override knob.
- **Summaries** use the conversation's selected model, generated once
  (no auto-regeneration), but user-visible and editable to guard against silent
  degradation when summaries replace real content under context pressure.
- **All messages editable**; immutability scoped to `draft_turns` only. Accepts
  that an edited `sent` message can drift from its turns.
- **Free mid-conversation provider/model switching**; each AI turn stamped with
  its `provider`/`model`.

Deferred (known limitations, acceptable for personal single-user use):

- **Timeline is never compressed.** If timeline + current session alone exceed
  budget, the server fails loudly rather than degrading gracefully. Timeline
  summarization can be added later as a tier below session-toggling.
- **`countTokens` uses the real provider API inside the compression loop.**
  Acceptable because conversations are expected to be short, so the loop rarely
  iterates; can move to a local heuristic + margin if it ever costs latency.
- **User-header trust deferred.** A single constant `user_id` is used for now;
  the `user_id` column and namespacing stay in place for the future multi-user
  extension, but `DEFAULT_USER_ID` / `TRUST_USER_HEADER` handling is not built.

## Open Questions / Future

- Multi-party conversations (schema already accommodates).
- Shared `contacts` entity so the same person across multiple conversations can
  be linked and given a per-contact profile (additive, no migration needed).
- Style learning from sent messages.
- Streaming AI responses to the UI.
- Native desktop client reusing the API.

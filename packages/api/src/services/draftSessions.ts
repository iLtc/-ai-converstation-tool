import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  OpenDraftSessionInput, AddFollowupInput, EditDraftInput,
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
import { curateSession, renderSessionFull } from '../context/curate.js';
import {
  renderTimeline, renderBrief, renderAnswers, renderDraft, latestDraftOrEdit, type RenderTurn,
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

function rawTurns(db: DB, sessionId: string) {
  return db.select().from(draftTurns).where(eq(draftTurns.sessionId, sessionId))
    .orderBy(asc(draftTurns.position)).all();
}

function sessionTurns(db: DB, sessionId: string): RenderTurn[] {
  return rawTurns(db, sessionId).map((t) => ({ kind: t.kind, content: t.content }));
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
  const draft = latestDraftOrEdit(turns);
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
    // Defensive: the WHERE already excludes the current (open) session since it isn't 'sent';
    // this guards against ever passing a just-finalized session id here.
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

  const created: ReturnType<typeof insertTurn>[] = [];
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
  try {
    await runAiRound(db, userId, sessionId, deps);
  } catch (err) {
    // First AI round failed — remove the just-created session + its turns so the
    // conversation isn't left with a dangling open session blocking new ones.
    db.delete(draftTurns).where(eq(draftTurns.sessionId, sessionId)).run();
    db.delete(draftSessions).where(eq(draftSessions.id, sessionId)).run();
    throw err;
  }

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
  const draft = latestDraftOrEdit(turns);
  if (!draft) throw new ConflictError('Cannot finalize a session with no draft');

  const conv = await getConversation(db, userId, session.conversationId);
  const me = db.select().from(participants)
    .where(and(eq(participants.conversationId, session.conversationId), eq(participants.role, 'me'))).get()!;

  // Generate the summary BEFORE any writes: a provider failure here must leave the
  // session open and the timeline untouched, so finalize can be retried safely
  // without duplicating the sent message.
  const { model } = resolveProviderModel({ provider: conv.provider, model: conv.model }, deps.defaults);
  const summary = await generateSummary(deps.provider, model, renderSessionFull(turns));

  const positions = db.select({ position: messages.position }).from(messages)
    .where(eq(messages.conversationId, session.conversationId)).all().map((r) => r.position);
  const sentMessageId = newId();

  // Write the sent message, optional email subject, and session close atomically.
  db.transaction((tx) => {
    tx.insert(messages).values({
      id: sentMessageId, conversationId: session.conversationId, senderParticipantId: me.id,
      body: draft.body, kind: 'live', status: 'sent',
      position: nextPosition(positions), createdAt: new Date(),
    }).run();

    if (conv.type === 'email' && draft.subject) {
      tx.update(conversations).set({ emailSubject: draft.subject, updatedAt: new Date() })
        .where(eq(conversations.id, session.conversationId)).run();
    }

    tx.update(draftSessions).set({
      status: 'sent', sentMessageId, summary, closedAt: new Date(),
    }).where(eq(draftSessions.id, sessionId)).run();
  });

  const updated = db.select().from(draftSessions).where(eq(draftSessions.id, sessionId)).get()!;
  return { session: updated };
}

export async function abandonSession(db: DB, userId: string, sessionId: string) {
  const session = await ownedSession(db, userId, sessionId);
  if (session.status !== 'open') throw new ConflictError('Draft session is not open');
  db.update(draftSessions).set({ status: 'abandoned', closedAt: new Date() })
    .where(eq(draftSessions.id, sessionId)).run();
}

/** All draft sessions for a conversation (oldest-first), each with its ordered turns. */
export async function listDraftSessions(db: DB, userId: string, convId: string) {
  await getConversation(db, userId, convId); // authorize
  const sessions = db.select().from(draftSessions)
    .where(eq(draftSessions.conversationId, convId))
    .orderBy(asc(draftSessions.createdAt)).all();
  return { sessions: sessions.map((s) => ({ ...s, turns: rawTurns(db, s.id) })) };
}

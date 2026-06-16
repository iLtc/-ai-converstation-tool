import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation } from './conversations.js';
import { addMessage, listMessages } from './messages.js';
import { openDraftSession, addFollowup, editDraft, finalizeSession, abandonSession, listDraftSessions } from './draftSessions.js';
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
    const res = await finalizeSession(db, 'u1', opened.session.id, deps([]));
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
    const again = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g2' } },
      deps([{ draft: { body: 'd2' } }]));
    expect(again.session.status).toBe('open');
  });
});

describe('listDraftSessions', () => {
  it('returns sessions oldest-first, each with its ordered turns', async () => {
    const { db, convId } = await convWithHistory();
    // Single deps object so the provider's queue is shared across all calls
    const d = deps([
      { draft: { body: 'first draft' } },  // consumed by first openDraftSession
      { draft: { body: 'second draft' } }, // consumed by second openDraftSession
    ]);
    const first = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g1' } }, d);
    await finalizeSession(db, 'u1', first.session.id, d); // uses completeText only, no queue shift
    const second = await openDraftSession(db, 'u1', convId, { brief: { goal: 'g2' } }, d);

    const result = await listDraftSessions(db, 'u1', convId);
    expect(result.sessions).toHaveLength(2);
    const [s0, s1] = result.sessions;
    expect(s0!.id).toBe(first.session.id);
    expect(s0!.status).toBe('sent');
    expect(s0!.turns.map((t) => t.kind)).toEqual(['brief', 'draft']);
    expect(s1!.id).toBe(second.session.id);
    expect(s1!.status).toBe('open');
    // No answers in the queued output → turns are brief + draft only
    expect(s1!.turns.map((t) => t.kind)).toEqual(['brief', 'draft']);
  });

  it('authorizes by user (throws NotFound for another user)', async () => {
    const { db, convId } = await convWithHistory();
    await expect(listDraftSessions(db, 'u2', convId)).rejects.toThrow(/not found/i);
  });
});

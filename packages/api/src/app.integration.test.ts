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
      { answers: { items: ['Be warm'] }, draft: { body: 'Friday works for me.' } },
      { draft: { body: 'Thanks — see you then!' } },
    ];
    const app = makeApp(queue);

    const conv = await json(await app.request('/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'With Sam', type: 'chat', theirName: 'Sam' }),
    }));
    expect(conv.id).toBeTruthy();

    await app.request(`/conversations/${conv.id}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senderRole: 'them', body: 'Can we meet Friday?', kind: 'reconstructed' }),
    });

    const opened = await json(await app.request(`/conversations/${conv.id}/draft-sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { goal: 'Agree to Friday' } }),
    }));
    expect(opened.turns.map((t: any) => t.kind)).toEqual(['brief', 'answers', 'draft']);
    const sessionId = opened.session.id;

    const finalized = await json(await app.request(`/draft-sessions/${sessionId}/finalize`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }));
    expect(finalized.session.status).toBe('sent');
    expect(finalized.session.summary).toBe('session summary');

    const msgs = await json(await app.request(`/conversations/${conv.id}/messages`));
    expect(msgs.some((m: any) => m.status === 'sent' && m.body === 'Friday works for me.')).toBe(true);

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

  it('returns 404 with a not_found envelope for a missing conversation', async () => {
    const app = makeApp([]);
    const res = await app.request('/conversations/does-not-exist');
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('not_found');
  });

  it('returns 400 with a validation_error envelope (incl. details) for an invalid body', async () => {
    const app = makeApp([]);
    const res = await app.request('/conversations', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}), // missing required title/type
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details).toBeTruthy();
  });
});

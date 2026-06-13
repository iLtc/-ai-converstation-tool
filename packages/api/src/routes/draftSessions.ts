import { Hono } from 'hono';
import type { Context } from 'hono';
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
async function overridesForSession(c: Context<AppContext>, sessionId: string) {
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

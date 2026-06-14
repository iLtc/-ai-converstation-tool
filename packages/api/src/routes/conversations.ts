import { Hono } from 'hono';
import { CreateConversationInput, UpdateConversationInput } from '@app/shared';
import type { AppContext } from '../app.js';
import { parseBody } from './validate.js';
import { createConversation, getConversation, listConversations, updateConversation } from '../services/conversations.js';

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

  r.patch('/:id', async (c) => {
    const input = parseBody(UpdateConversationInput, await c.req.json());
    const conv = await updateConversation(c.get('deps').db, c.get('userId'), c.req.param('id'), input);
    return c.json(conv);
  });

  return r;
}

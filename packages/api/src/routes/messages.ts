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

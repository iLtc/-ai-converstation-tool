import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation } from './conversations.js';
import { addMessage, listMessages, updateMessage, reorderMessage, deleteMessage } from './messages.js';

async function setup() {
  const db = createTestDb();
  const conv = await createConversation(db, 'u1', { title: 'C', type: 'chat' });
  return { db, convId: conv.id };
}

describe('messages service', () => {
  it('appends messages with increasing positions and derives sent/received status', async () => {
    const { db, convId } = await setup();
    const a = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'Hi', kind: 'reconstructed' });
    const b = await addMessage(db, 'u1', convId, { senderRole: 'me', body: 'Hello', kind: 'reconstructed' });
    expect(b.position).toBeGreaterThan(a.position);
    expect(a.status).toBe('received'); // from 'them'
    expect(b.status).toBe('sent');     // from 'me'
  });

  it('inserts between two messages via afterMessageId', async () => {
    const { db, convId } = await setup();
    const a = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'A', kind: 'reconstructed' });
    const c = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'C', kind: 'reconstructed' });
    const b = await addMessage(db, 'u1', convId, { senderRole: 'them', body: 'B', kind: 'reconstructed', afterMessageId: a.id });
    const ordered = (await listMessages(db, 'u1', convId)).map((m) => m.body);
    expect(ordered).toEqual(['A', 'B', 'C']);
  });

  it('edits, reorders, and deletes messages', async () => {
    const { db, convId } = await setup();
    const a = await addMessage(db, 'u1', convId, { senderRole: 'me', body: 'one', kind: 'reconstructed' });
    const b = await addMessage(db, 'u1', convId, { senderRole: 'me', body: 'two', kind: 'reconstructed' });
    await updateMessage(db, 'u1', a.id, { body: 'edited' });
    await reorderMessage(db, 'u1', a.id, { afterMessageId: b.id }); // move a after b
    let ordered = (await listMessages(db, 'u1', convId)).map((m) => m.body);
    expect(ordered).toEqual(['two', 'edited']);
    await deleteMessage(db, 'u1', b.id);
    ordered = (await listMessages(db, 'u1', convId)).map((m) => m.body);
    expect(ordered).toEqual(['edited']);
  });
});

import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation, getConversation, listConversations } from './conversations.js';

describe('conversations service', () => {
  it('creates a conversation with two participants and lists it', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', {
      title: 'With Sam', type: 'chat', theirName: 'Sam', myName: 'Me',
    });
    expect(conv.id).toBeTruthy();

    const fetched = await getConversation(db, 'u1', conv.id);
    expect(fetched.participants.map((p) => p.role).sort()).toEqual(['me', 'them']);
    expect(fetched.participants.find((p) => p.role === 'them')!.displayName).toBe('Sam');

    const all = await listConversations(db, 'u1');
    expect(all).toHaveLength(1);
  });

  it('does not return another user\'s conversation', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'X', type: 'chat' });
    await expect(getConversation(db, 'other', conv.id)).rejects.toThrow(/not found/i);
  });
});

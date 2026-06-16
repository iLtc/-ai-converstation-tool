import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createConversation, getConversation, listConversations, updateConversation } from './conversations.js';

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

describe('updateConversation', () => {
  it('updates settings, participant names, and bumps updatedAt', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat', theirName: 'Sam' });
    const updated = await updateConversation(db, 'u1', conv.id, {
      title: 'B', toneNote: 'warm', theirName: 'Samantha',
    });
    expect(updated.title).toBe('B');
    expect(updated.toneNote).toBe('warm');
    expect(updated.participants.find((p) => p.role === 'them')!.displayName).toBe('Samantha');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(conv.updatedAt.getTime());
  });

  it('clears a nullable field when null is passed and leaves omitted fields untouched', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat', toneNote: 'x' });
    const updated = await updateConversation(db, 'u1', conv.id, { toneNote: null });
    expect(updated.toneNote).toBeNull();
    expect(updated.title).toBe('A');
  });

  it('rejects a style profile the user does not own', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat' });
    await expect(updateConversation(db, 'u1', conv.id, { styleProfileId: 'nope' }))
      .rejects.toThrow(/not found/i);
  });

  it('throws NotFound for another user\'s conversation', async () => {
    const db = createTestDb();
    const conv = await createConversation(db, 'u1', { title: 'A', type: 'chat' });
    await expect(updateConversation(db, 'u2', conv.id, { title: 'B' })).rejects.toThrow(/not found/i);
  });
});

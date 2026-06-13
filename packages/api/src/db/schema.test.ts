import { describe, it, expect } from 'vitest';
import { createTestDb } from './testDb.js';
import { conversations } from './schema.js';

describe('schema + migrations', () => {
  it('creates tables and round-trips a conversation row', () => {
    const db = createTestDb();
    const now = new Date();
    db.insert(conversations).values({
      id: 'c1', userId: 'u1', title: 'Test', type: 'chat',
      createdAt: now, updatedAt: now,
    }).run();
    const rows = db.select().from(conversations).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('Test');
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });
});

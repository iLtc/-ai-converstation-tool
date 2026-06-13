import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/testDb.js';
import { createStyleProfile, listStyleProfiles } from './styleProfiles.js';

describe('style profiles service', () => {
  it('creates and lists style profiles per user', async () => {
    const db = createTestDb();
    const sp = await createStyleProfile(db, 'u1', { name: 'Formal', instructions: 'Be formal.' });
    expect(sp.id).toBeTruthy();
    expect(await listStyleProfiles(db, 'u1')).toHaveLength(1);
    expect(await listStyleProfiles(db, 'u2')).toHaveLength(0);
  });
});

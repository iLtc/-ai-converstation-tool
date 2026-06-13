import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { CreateStyleProfileInput } from '@app/shared';
import type { DB } from '../db/client.js';
import { styleProfiles } from '../db/schema.js';
import { newId } from './ids.js';

type CreateInput = z.infer<typeof CreateStyleProfileInput>;

export async function createStyleProfile(db: DB, userId: string, input: CreateInput) {
  const row = {
    id: newId(), userId, name: input.name,
    description: input.description ?? null, instructions: input.instructions,
  };
  db.insert(styleProfiles).values(row).run();
  return row;
}

export async function listStyleProfiles(db: DB, userId: string) {
  return db.select().from(styleProfiles).where(eq(styleProfiles.userId, userId)).all();
}

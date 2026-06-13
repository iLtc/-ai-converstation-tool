import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { CreateConversationInput } from '@app/shared';
import type { DB } from '../db/client.js';
import { conversations, participants, styleProfiles } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { newId } from './ids.js';

type CreateInput = z.infer<typeof CreateConversationInput>;

export async function createConversation(db: DB, userId: string, input: CreateInput) {
  if (input.styleProfileId) {
    const owned = db.select().from(styleProfiles)
      .where(and(eq(styleProfiles.id, input.styleProfileId), eq(styleProfiles.userId, userId))).get();
    if (!owned) throw new NotFoundError('Style profile');
  }
  const id = newId();
  const now = new Date();
  db.insert(conversations).values({
    id, userId, title: input.title, type: input.type,
    emailSubject: input.emailSubject ?? null,
    toneNote: input.toneNote ?? null,
    styleProfileId: input.styleProfileId ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    createdAt: now, updatedAt: now,
  }).run();

  db.insert(participants).values([
    { id: newId(), conversationId: id, displayName: input.myName ?? 'Me', role: 'me' },
    { id: newId(), conversationId: id, displayName: input.theirName ?? 'Them', role: 'them' },
  ]).run();

  return getConversation(db, userId, id);
}

export async function getConversation(db: DB, userId: string, id: string) {
  const conv = db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId))).get();
  if (!conv) throw new NotFoundError('Conversation');
  const parts = db.select().from(participants).where(eq(participants.conversationId, id)).all();
  return { ...conv, participants: parts };
}

export async function listConversations(db: DB, userId: string) {
  return db.select().from(conversations).where(eq(conversations.userId, userId)).all();
}

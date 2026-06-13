import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { AddMessageInput, UpdateMessageInput, ReorderMessageInput } from '@app/shared';
import type { DB } from '../db/client.js';
import { messages, participants } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { getConversation } from './conversations.js';
import { newId } from './ids.js';
import { nextPosition, positionBetween } from './positions.js';

type AddInput = z.infer<typeof AddMessageInput>;
type UpdateInput = z.infer<typeof UpdateMessageInput>;
type ReorderInput = z.infer<typeof ReorderMessageInput>;

async function participantFor(db: DB, userId: string, convId: string, role: 'me' | 'them') {
  await getConversation(db, userId, convId); // authorizes the conversation
  const p = db.select().from(participants)
    .where(and(eq(participants.conversationId, convId), eq(participants.role, role))).get();
  if (!p) throw new NotFoundError('Participant');
  return p;
}

function orderedPositions(db: DB, convId: string): { id: string; position: number }[] {
  return db.select({ id: messages.id, position: messages.position }).from(messages)
    .where(eq(messages.conversationId, convId)).orderBy(asc(messages.position)).all();
}

/** Position to use when inserting after `afterId` (or append when undefined). */
function insertPosition(db: DB, convId: string, afterId?: string | null): number {
  const all = orderedPositions(db, convId);
  if (afterId === undefined) return nextPosition(all.map((m) => m.position));
  if (afterId === null) return positionBetween(null, all[0]?.position ?? null);
  const idx = all.findIndex((m) => m.id === afterId);
  if (idx === -1) throw new NotFoundError('Anchor message');
  return positionBetween(all[idx]!.position, all[idx + 1]?.position ?? null);
}

export async function addMessage(db: DB, userId: string, convId: string, input: AddInput) {
  const sender = await participantFor(db, userId, convId, input.senderRole);
  const status = input.status ?? (input.senderRole === 'me' ? 'sent' : 'received');
  const position = insertPosition(db, convId, input.afterMessageId);
  const row = {
    id: newId(), conversationId: convId, senderParticipantId: sender.id,
    body: input.body, kind: input.kind, status, position, createdAt: new Date(),
  };
  db.insert(messages).values(row).run();
  return row;
}

export async function listMessages(db: DB, userId: string, convId: string) {
  await getConversation(db, userId, convId);
  return db.select().from(messages)
    .where(eq(messages.conversationId, convId)).orderBy(asc(messages.position)).all();
}

function ownedMessage(db: DB, userId: string, id: string) {
  const msg = db.select().from(messages).where(eq(messages.id, id)).get();
  if (!msg) throw new NotFoundError('Message');
  return msg;
}

export async function updateMessage(db: DB, userId: string, id: string, input: UpdateInput) {
  const msg = ownedMessage(db, userId, id);
  await getConversation(db, userId, msg.conversationId);
  db.update(messages).set({ body: input.body }).where(eq(messages.id, id)).run();
}

export async function reorderMessage(db: DB, userId: string, id: string, input: ReorderInput) {
  const msg = ownedMessage(db, userId, id);
  await getConversation(db, userId, msg.conversationId);
  const others = orderedPositions(db, msg.conversationId).filter((m) => m.id !== id);
  let position: number;
  if (input.afterMessageId === null) {
    position = positionBetween(null, others[0]?.position ?? null);
  } else {
    const idx = others.findIndex((m) => m.id === input.afterMessageId);
    if (idx === -1) throw new NotFoundError('Anchor message');
    position = positionBetween(others[idx]!.position, others[idx + 1]?.position ?? null);
  }
  db.update(messages).set({ position }).where(eq(messages.id, id)).run();
}

export async function deleteMessage(db: DB, userId: string, id: string) {
  const msg = ownedMessage(db, userId, id);
  await getConversation(db, userId, msg.conversationId);
  db.delete(messages).where(eq(messages.id, id)).run();
}

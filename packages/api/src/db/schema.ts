import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type {
  BriefContent, AnswersContent, DraftContent, FollowupContent,
} from '@app/shared';

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(), // chat | email
  emailSubject: text('email_subject'),
  toneNote: text('tone_note'),
  styleProfileId: text('style_profile_id'),
  provider: text('provider'),
  model: text('model'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(), // me | them
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  senderParticipantId: text('sender_participant_id').notNull(),
  body: text('body').notNull(),
  kind: text('kind').notNull(),     // reconstructed | live
  status: text('status').notNull(), // received | sent
  position: integer('position').notNull(),
  createdAt: ts('created_at').notNull(),
});

export const draftSessions = sqliteTable('draft_sessions', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  status: text('status').notNull(), // open | sent | abandoned
  summary: text('summary'),         // generated on send, user-editable
  sentMessageId: text('sent_message_id'),
  createdAt: ts('created_at').notNull(),
  closedAt: ts('closed_at'),
});

type TurnContent = BriefContent | AnswersContent | DraftContent | FollowupContent;

export const draftTurns = sqliteTable('draft_turns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  position: integer('position').notNull(),
  role: text('role').notNull(), // user | assistant
  kind: text('kind').notNull(), // brief | answers | draft | edit | followup
  content: text('content', { mode: 'json' }).$type<TurnContent>().notNull(),
  provider: text('provider'),
  model: text('model'),
  createdAt: ts('created_at').notNull(),
});

export const styleProfiles = sqliteTable('style_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  instructions: text('instructions').notNull(),
});

import { z } from 'zod';

// ---- Enums ----
export const Role = z.enum(['me', 'them']);
export const ConversationType = z.enum(['chat', 'email']);
export const MessageKind = z.enum(['reconstructed', 'live']);
export const MessageStatus = z.enum(['received', 'sent']);
export const DraftSessionStatus = z.enum(['open', 'sent', 'abandoned']);
export const DraftTurnRole = z.enum(['user', 'assistant']);
export const DraftTurnKind = z.enum(['brief', 'answers', 'draft', 'edit', 'followup']);

export type Role = z.infer<typeof Role>;
export type ConversationType = z.infer<typeof ConversationType>;
export type DraftTurnKind = z.infer<typeof DraftTurnKind>;
export type MessageKind = z.infer<typeof MessageKind>;
export type MessageStatus = z.infer<typeof MessageStatus>;
export type DraftSessionStatus = z.infer<typeof DraftSessionStatus>;
export type DraftTurnRole = z.infer<typeof DraftTurnRole>;

// ---- Per-kind content shapes (draft_turns.content is JSON) ----
export const BriefContent = z.object({
  goal: z.string().min(1),
  background: z.string().optional(),
  questions: z.string().optional(),
});
export const AnswersContent = z.object({ items: z.array(z.string()) });
export const DraftContent = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
});
// The stored followup turn holds the user's instruction text under `text`.
// The API accepts it as `instruction` (see AddFollowupInput); the service maps instruction -> { text }.
export const FollowupContent = z.object({ text: z.string().min(1) });

export type BriefContent = z.infer<typeof BriefContent>;
export type AnswersContent = z.infer<typeof AnswersContent>;
export type DraftContent = z.infer<typeof DraftContent>;
export type FollowupContent = z.infer<typeof FollowupContent>;

/** Returns the zod schema that validates a draft_turn's content for a given kind. */
export function contentSchemaForKind(kind: DraftTurnKind) {
  switch (kind) {
    case 'brief': return BriefContent;
    case 'answers': return AnswersContent;
    case 'draft':
    case 'edit': return DraftContent;
    case 'followup': return FollowupContent;
  }
}

// ---- Forced AI tool output ----
export const RespondOutput = z.object({
  answers: AnswersContent.optional(),
  draft: DraftContent,
});
export type RespondOutput = z.infer<typeof RespondOutput>;

// ---- API request DTOs ----
export const CreateConversationInput = z.object({
  title: z.string().min(1),
  type: ConversationType,
  emailSubject: z.string().optional(),
  toneNote: z.string().optional(),
  styleProfileId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  theirName: z.string().optional(),
  myName: z.string().optional(),
});
export type CreateConversationInput = z.infer<typeof CreateConversationInput>;

export const AddMessageInput = z.object({
  senderRole: Role,
  body: z.string().min(1),
  kind: MessageKind.default('reconstructed'),
  status: MessageStatus.optional(),
  afterMessageId: z.string().optional(),
});
export type AddMessageInput = z.infer<typeof AddMessageInput>;

export const UpdateMessageInput = z.object({ body: z.string().min(1) });
export type UpdateMessageInput = z.infer<typeof UpdateMessageInput>;
export const ReorderMessageInput = z.object({
  afterMessageId: z.string().nullable(),
});
export type ReorderMessageInput = z.infer<typeof ReorderMessageInput>;

export const OpenDraftSessionInput = z.object({ brief: BriefContent });
export const AddFollowupInput = z.object({ instruction: z.string().min(1) });
export const EditDraftInput = z.object({ draft: DraftContent });

export const CreateStyleProfileInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
});
export type CreateStyleProfileInput = z.infer<typeof CreateStyleProfileInput>;

// Partial update of a conversation's settings. Every field optional; nullable
// fields may be sent as null to clear them. The service applies only keys present.
export const UpdateConversationInput = z.object({
  title: z.string().min(1).optional(),
  type: ConversationType.optional(),
  emailSubject: z.string().nullable().optional(),
  toneNote: z.string().nullable().optional(),
  styleProfileId: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  theirName: z.string().min(1).optional(),
  myName: z.string().min(1).optional(),
});
export type UpdateConversationInput = z.infer<typeof UpdateConversationInput>;

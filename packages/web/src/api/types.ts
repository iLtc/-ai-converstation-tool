import type {
  Role, ConversationType, MessageKind, MessageStatus, DraftSessionStatus,
  DraftTurnRole, DraftTurnKind, BriefContent, AnswersContent, DraftContent, FollowupContent,
} from '@app/shared';

export interface Participant {
  id: string; conversationId: string; displayName: string; role: Role;
}
export interface Conversation {
  id: string; userId: string; title: string; type: ConversationType;
  emailSubject: string | null; toneNote: string | null; styleProfileId: string | null;
  provider: string | null; model: string | null; createdAt: string; updatedAt: string;
  participants: Participant[];
}
export interface Message {
  id: string; conversationId: string; senderParticipantId: string; body: string;
  kind: MessageKind; status: MessageStatus; position: number; createdAt: string;
}
export interface DraftSession {
  id: string; conversationId: string; status: DraftSessionStatus;
  summary: string | null; sentMessageId: string | null; createdAt: string; closedAt: string | null;
}
export type TurnContent = BriefContent | AnswersContent | DraftContent | FollowupContent;
export interface DraftTurn {
  id: string; sessionId: string; position: number; role: DraftTurnRole;
  kind: DraftTurnKind; content: TurnContent; provider: string | null; model: string | null; createdAt: string;
}
export type SessionWithTurns = DraftSession & { turns: DraftTurn[] };
export interface StyleProfile {
  id: string; userId: string; name: string; description: string | null; instructions: string;
}

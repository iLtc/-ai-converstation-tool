import type {
  CreateConversationInput, UpdateConversationInput, AddMessageInput, UpdateMessageInput,
  ReorderMessageInput, BriefContent, DraftContent, CreateStyleProfileInput,
} from '@app/shared';
import { apiFetch } from './client.ts';
import type {
  Conversation, ConversationSummary, Message, DraftSession, DraftTurn, SessionWithTurns, StyleProfile,
} from './types.ts';

const body = (v: unknown) => JSON.stringify(v);

export const api = {
  // conversations
  listConversations: () => apiFetch<ConversationSummary[]>('/conversations'),
  getConversation: (id: string) => apiFetch<Conversation>(`/conversations/${id}`),
  createConversation: (input: CreateConversationInput) =>
    apiFetch<Conversation>('/conversations', { method: 'POST', body: body(input) }),
  updateConversation: (id: string, input: UpdateConversationInput) =>
    apiFetch<Conversation>(`/conversations/${id}`, { method: 'PATCH', body: body(input) }),

  // messages
  listMessages: (convId: string) => apiFetch<Message[]>(`/conversations/${convId}/messages`),
  addMessage: (convId: string, input: AddMessageInput) =>
    apiFetch<Message>(`/conversations/${convId}/messages`, { method: 'POST', body: body(input) }),
  updateMessage: (id: string, input: UpdateMessageInput) =>
    apiFetch<void>(`/messages/${id}`, { method: 'PATCH', body: body(input) }),
  reorderMessage: (id: string, input: ReorderMessageInput) =>
    apiFetch<void>(`/messages/${id}/reorder`, { method: 'POST', body: body(input) }),
  deleteMessage: (id: string) => apiFetch<void>(`/messages/${id}`, { method: 'DELETE' }),

  // draft sessions
  listDraftSessions: (convId: string) =>
    apiFetch<{ sessions: SessionWithTurns[] }>(`/conversations/${convId}/draft-sessions`),
  openDraftSession: (convId: string, brief: BriefContent) =>
    apiFetch<{ session: DraftSession; turns: DraftTurn[] }>(
      `/conversations/${convId}/draft-sessions`, { method: 'POST', body: body({ brief }) }),
  addFollowup: (sessionId: string, instruction: string) =>
    apiFetch<{ turns: DraftTurn[] }>(
      `/draft-sessions/${sessionId}/followups`, { method: 'POST', body: body({ instruction }) }),
  editDraft: (sessionId: string, draft: DraftContent) =>
    apiFetch<{ turn: DraftTurn }>(
      `/draft-sessions/${sessionId}/edits`, { method: 'POST', body: body({ draft }) }),
  finalizeSession: (sessionId: string) =>
    apiFetch<{ session: DraftSession }>(`/draft-sessions/${sessionId}/finalize`, { method: 'POST', body: '{}' }),
  abandonSession: (sessionId: string) =>
    apiFetch<void>(`/draft-sessions/${sessionId}/abandon`, { method: 'POST', body: '{}' }),

  // style profiles
  listStyleProfiles: () => apiFetch<StyleProfile[]>('/style-profiles'),
  createStyleProfile: (input: CreateStyleProfileInput) =>
    apiFetch<StyleProfile>('/style-profiles', { method: 'POST', body: body(input) }),
};

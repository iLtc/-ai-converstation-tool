import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BriefContent, DraftContent } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useDraftSessions(convId: string) {
  return useQuery({
    queryKey: queryKeys.draftSessions(convId),
    queryFn: () => api.listDraftSessions(convId),
  });
}

export function useOpenDraftSession(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (brief: BriefContent) => api.openDraftSession(convId, brief),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

export function useAddFollowup(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, instruction }: { sessionId: string; instruction: string }) =>
      api.addFollowup(sessionId, instruction),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

export function useEditDraft(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, draft }: { sessionId: string; draft: DraftContent }) =>
      api.editDraft(sessionId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

export function useFinalizeSession(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.finalizeSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) });
      qc.invalidateQueries({ queryKey: queryKeys.messages(convId) });
      // Finalize can update the conversation (e.g. emailSubject, updatedAt).
      qc.invalidateQueries({ queryKey: queryKeys.conversation(convId) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useAbandonSession(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.abandonSession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draftSessions(convId) }),
  });
}

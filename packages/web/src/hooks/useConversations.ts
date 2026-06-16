import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateConversationInput, UpdateConversationInput } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useConversations() {
  return useQuery({ queryKey: queryKeys.conversations, queryFn: api.listConversations });
}

export function useConversation(id: string) {
  return useQuery({ queryKey: queryKeys.conversation(id), queryFn: () => api.getConversation(id) });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) => api.createConversation(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.conversations }),
  });
}

export function useUpdateConversation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateConversationInput) => api.updateConversation(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.conversation(id) });
      qc.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

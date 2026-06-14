import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddMessageInput, UpdateMessageInput, ReorderMessageInput } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useMessages(convId: string) {
  return useQuery({ queryKey: queryKeys.messages(convId), queryFn: () => api.listMessages(convId) });
}

export function useAddMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMessageInput) => api.addMessage(convId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

export function useUpdateMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMessageInput }) => api.updateMessage(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

export function useReorderMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReorderMessageInput }) => api.reorderMessage(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

export function useDeleteMessage(convId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.messages(convId) }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateStyleProfileInput } from '@app/shared';
import { api } from '../api/endpoints.ts';
import { queryKeys } from '../lib/queryClient.ts';

export function useStyleProfiles() {
  return useQuery({ queryKey: queryKeys.styleProfiles, queryFn: api.listStyleProfiles });
}

export function useCreateStyleProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStyleProfileInput) => api.createStyleProfile(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.styleProfiles }),
  });
}

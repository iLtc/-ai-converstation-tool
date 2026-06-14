import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
});

export const queryKeys = {
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (convId: string) => ['messages', convId] as const,
  draftSessions: (convId: string) => ['draftSessions', convId] as const,
  styleProfiles: ['styleProfiles'] as const,
};

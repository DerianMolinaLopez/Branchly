import { QueryClient } from '@tanstack/react-query';
import { GitError } from '@/api';

/**
 * Data is refreshed by file-system events and after every mutation, so it
 * can stay fresh for long; refetching on focus catches anything missed while
 * the window was in the background.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      // Git errors are deterministic; only retry transport failures.
      retry: (count, error) => !(error instanceof GitError && error.code !== 'IPC') && count < 1,
    },
  },
});

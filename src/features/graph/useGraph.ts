import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { graphApi, isGitError, keys, type GraphInfo, type GraphRow } from '@/api';
import { queryClient } from '@/app/queryClient';
import { CHUNK_SIZE } from './constants';

export function useGraphInfo(repoId: string) {
  return useQuery({
    queryKey: keys.graphInfo(repoId),
    queryFn: () => graphApi.info(repoId),
  });
}

/**
 * Loads the chunks of rows covering `start..end` (graph indices, end
 * exclusive). Chunks are cached per fingerprint, so scrolling back is free and
 * a moved ref invalidates everything at once. While a new fingerprint loads,
 * the same chunk of the previous layout stays on screen to avoid flicker.
 */
export function useGraphRows(repoId: string, info: GraphInfo | undefined, start: number, end: number) {
  const fingerprint = info?.fingerprint ?? '';
  const chunks = useMemo(() => {
    if (!info || info.total === 0 || end <= start) return [];
    const first = Math.floor(Math.max(0, start) / CHUNK_SIZE);
    const last = Math.floor((Math.min(end, info.total) - 1) / CHUNK_SIZE);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
  }, [info, start, end]);

  const results = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: keys.graphRows(repoId, fingerprint, chunk),
      queryFn: async () => {
        try {
          return await graphApi.rows(repoId, fingerprint, chunk * CHUNK_SIZE, CHUNK_SIZE);
        } catch (error) {
          if (isGitError(error, 'STALE_GRAPH')) {
            void queryClient.invalidateQueries({ queryKey: keys.graphInfo(repoId) });
          }
          throw error;
        }
      },
      staleTime: Infinity,
      placeholderData: (previous: GraphRow[] | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
        previousQuery?.queryKey[5] === chunk ? previous : undefined,
    })),
  });

  const pages = results.map((r) => r.data);

  const getRow = (index: number): GraphRow | undefined => {
    const chunk = Math.floor(index / CHUNK_SIZE);
    const position = chunks.indexOf(chunk);
    return position === -1 ? undefined : pages[position]?.[index - chunk * CHUNK_SIZE];
  };

  const error = results.find((r) => r.error)?.error ?? null;
  return { getRow, error };
}

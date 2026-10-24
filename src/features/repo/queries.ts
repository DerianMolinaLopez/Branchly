import { useQuery } from '@tanstack/react-query';
import {
  branchesApi,
  keys,
  remotesApi,
  repositoriesApi,
  stagingApi,
  stashApi,
  tagsApi,
} from '@/api';

export function useRepoInfo(repoId: string) {
  return useQuery({
    queryKey: keys.info(repoId),
    queryFn: () => repositoriesApi.info(repoId),
    enabled: repoId !== '',
  });
}

export function useStatus(repoId: string) {
  return useQuery({
    queryKey: keys.status(repoId),
    queryFn: () => stagingApi.status(repoId),
    enabled: repoId !== '',
  });
}

export function useBranches(repoId: string) {
  return useQuery({
    queryKey: keys.branches(repoId),
    queryFn: () => branchesApi.list(repoId),
    enabled: repoId !== '',
  });
}

export function useTags(repoId: string) {
  return useQuery({
    queryKey: keys.tags(repoId),
    queryFn: () => tagsApi.list(repoId),
    enabled: repoId !== '',
  });
}

export function useStashes(repoId: string) {
  return useQuery({
    queryKey: keys.stashes(repoId),
    queryFn: () => stashApi.list(repoId),
    enabled: repoId !== '',
  });
}

export function useRemotes(repoId: string) {
  return useQuery({
    queryKey: keys.remotes(repoId),
    queryFn: () => remotesApi.list(repoId),
    enabled: repoId !== '',
  });
}

/** The branch HEAD points to, with its ahead/behind counts. */
export function useCurrentBranch(repoId: string) {
  const branches = useBranches(repoId);
  return branches.data?.find((b) => b.isHead && !b.isRemote) ?? null;
}

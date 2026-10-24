import { createContext, useContext } from 'react';

/** True inside the repository tab that is currently visible. */
export const RepoActiveContext = createContext(false);

export function useRepoActive(): boolean {
  return useContext(RepoActiveContext);
}

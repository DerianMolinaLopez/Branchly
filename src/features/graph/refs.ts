import type { RefLabel } from '@/api';

/** A chip in the graph: a branch (local and/or remote copies) or a tag. */
export interface RefGroup {
  key: string;
  /** Display name: the local name, or the remote one when only remote exists. */
  name: string;
  kind: 'branch' | 'tag' | 'head';
  local: RefLabel | null;
  remotes: RefLabel[];
  tag: RefLabel | null;
  isHead: boolean;
}

/** Strips the remote prefix ("origin/feature" → "feature"). */
export function remoteBranchName(name: string): string {
  const slash = name.indexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}

/**
 * Groups labels of one commit: a local branch and its remote copies with the
 * same name become one chip, as do several remotes of a remote-only branch.
 * The HEAD branch comes first, then branches, then tags.
 */
export function groupRefs(labels: RefLabel[]): RefGroup[] {
  const groups: RefGroup[] = [];
  const branches = new Map<string, RefGroup>();
  for (const label of labels) {
    if (label.kind === 'tag') {
      groups.push({ key: label.fullName, name: label.name, kind: 'tag', local: null, remotes: [], tag: label, isHead: false });
    } else if (label.kind === 'head') {
      groups.push({ key: 'HEAD', name: 'HEAD', kind: 'head', local: null, remotes: [], tag: null, isHead: true });
    } else {
      const short = label.kind === 'localBranch' ? label.name : remoteBranchName(label.name);
      let group = branches.get(short);
      if (!group) {
        group = { key: `branch:${short}`, name: label.name, kind: 'branch', local: null, remotes: [], tag: null, isHead: false };
        branches.set(short, group);
        groups.push(group);
      }
      if (label.kind === 'localBranch') {
        group.local = label;
        group.name = label.name;
        group.isHead ||= label.isHead;
      } else {
        group.remotes.push(label);
      }
    }
  }
  const rank = (g: RefGroup) => (g.isHead ? 0 : g.kind === 'head' ? 1 : g.kind === 'branch' ? 2 : 3);
  return groups.sort((a, b) => rank(a) - rank(b));
}

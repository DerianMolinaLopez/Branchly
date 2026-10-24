import { describe, expect, it } from 'vitest';
import type { RefLabel } from '@/api';
import { groupRefs, remoteBranchName } from './refs';

const label = (name: string, kind: RefLabel['kind'], isHead = false): RefLabel => ({
  name,
  fullName:
    kind === 'localBranch'
      ? `refs/heads/${name}`
      : kind === 'remoteBranch'
        ? `refs/remotes/${name}`
        : kind === 'tag'
          ? `refs/tags/${name}`
          : 'HEAD',
  kind,
  isHead,
});

describe('groupRefs', () => {
  it('merges a local branch with its remote copies', () => {
    const groups = groupRefs([
      label('origin/main', 'remoteBranch'),
      label('main', 'localBranch', true),
      label('upstream/main', 'remoteBranch'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('main');
    expect(groups[0]?.isHead).toBe(true);
    expect(groups[0]?.remotes.map((r) => r.name)).toEqual(['origin/main', 'upstream/main']);
  });

  it('keeps remote-only branches under their remote name', () => {
    const [group] = groupRefs([label('origin/feature', 'remoteBranch')]);
    expect(group?.name).toBe('origin/feature');
    expect(group?.local).toBeNull();
  });

  it('orders head first and tags last', () => {
    const groups = groupRefs([
      label('v1', 'tag'),
      label('dev', 'localBranch'),
      label('main', 'localBranch', true),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['main', 'dev', 'v1']);
  });

  it('strips remote prefixes', () => {
    expect(remoteBranchName('origin/feature/x')).toBe('feature/x');
    expect(remoteBranchName('plain')).toBe('plain');
  });
});

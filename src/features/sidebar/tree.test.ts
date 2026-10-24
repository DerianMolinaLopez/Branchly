import { describe, expect, it } from 'vitest';
import { buildTree, matchesFilter } from './tree';

describe('buildTree', () => {
  it('groups names by folder, folders first', () => {
    const tree = buildTree(['main', 'feature/login', 'feature/api/v2', 'dev'], (s) => s);
    expect(tree.map((n) => n.name)).toEqual(['feature', 'dev', 'main']);
    const feature = tree[0];
    expect(feature?.item).toBeNull();
    expect(feature?.children.map((n) => n.name)).toEqual(['api', 'login']);
    expect(feature?.children[0]?.children[0]?.item).toBe('feature/api/v2');
  });

  it('keeps a branch and a folder with the same name apart', () => {
    const tree = buildTree(['release', 'release/1.0'], (s) => s);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.item).toBeNull();
    expect(tree[1]?.item).toBe('release');
  });

  it('sorts numerically', () => {
    const tree = buildTree(['v10', 'v9', 'v1'], (s) => s);
    expect(tree.map((n) => n.name)).toEqual(['v1', 'v9', 'v10']);
  });
});

describe('matchesFilter', () => {
  it('matches case-insensitively and accepts empty filters', () => {
    expect(matchesFilter('feature/Login', 'login')).toBe(true);
    expect(matchesFilter('main', '  ')).toBe(true);
    expect(matchesFilter('main', 'dev')).toBe(false);
  });
});

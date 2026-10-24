import { describe, expect, it } from 'vitest';
import { colorIndex, initials } from './avatar';
import { languageFor } from './language';
import { basename, splitPath, tildify } from './path';
import { formatRelative } from './time';

describe('initials', () => {
  it('uses first and last word', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Grace Brewster Murray Hopper')).toBe('GH');
  });
  it('handles single names and handles', () => {
    expect(initials('linus')).toBe('LI');
    expect(initials('john.doe')).toBe('JD');
    expect(initials('')).toBe('?');
  });
});

describe('colorIndex', () => {
  it('is stable and within the lane palette', () => {
    expect(colorIndex('a@b.c')).toBe(colorIndex('a@b.c'));
    for (const key of ['x', 'someone@example.com', '']) {
      const index = colorIndex(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(8);
    }
  });
});

describe('paths', () => {
  it('splits directory and name', () => {
    expect(splitPath('src/app/main.ts')).toEqual({ dir: 'src/app/', name: 'main.ts' });
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' });
  });
  it('takes basenames of both separators', () => {
    expect(basename('/home/me/repo/')).toBe('repo');
    expect(basename('C:\\code\\repo')).toBe('repo');
  });
  it('replaces the home folder', () => {
    expect(tildify('/home/me/code', '/home/me')).toBe('~/code');
    expect(tildify('/opt/code', '/home/me')).toBe('/opt/code');
  });
});

describe('languageFor', () => {
  it('detects by extension and by name', () => {
    expect(languageFor('src/main.rs')).toBe('rust');
    expect(languageFor('App.TSX')).toBe('typescript');
    expect(languageFor('docker/Dockerfile')).toBe('dockerfile');
    expect(languageFor('LICENSE')).toBeNull();
  });
});

describe('formatRelative', () => {
  const now = 1_700_000_000;
  it('formats recent moments', () => {
    expect(formatRelative(now - 10, now)).toBe('ahora');
    expect(formatRelative(now - 3 * 3600, now)).toMatch(/3 h/);
    expect(formatRelative(now - 24 * 3600, now)).toBe('ayer');
    expect(formatRelative(now - 400 * 86400, now)).toMatch(/^hace 1 a/);
  });
});

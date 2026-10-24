/** Up to two initials for an author name ("Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  const words = name
    .replace(/[<>()[\]"']/g, ' ')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const chars = last ? [first[0], last[0]] : Array.from(first).slice(0, 2);
  return chars.join('').toUpperCase();
}

/** Stable lane-palette index (0–7) for an identity, so an author keeps a color. */
export function colorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 8;
}

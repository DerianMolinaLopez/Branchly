/** Splits "src/app/main.ts" into its directory ("src/app/") and file name. */
export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/');
  return slash === -1
    ? { dir: '', name: path }
    : { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

/** Last segment of a file system path, accepting both separators. */
export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).pop() ?? trimmed;
}

/** Shortens a path for display by replacing the home folder with "~". */
export function tildify(path: string, home: string | null): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

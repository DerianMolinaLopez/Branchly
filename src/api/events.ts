import { events, type RepoChanged } from './bindings';

/** Subscribes to file-system changes in open repositories. */
export function onRepoChanged(handler: (event: RepoChanged) => void): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;
  void events.repoChanged
    .listen((event) => {
      handler(event.payload);
    })
    .then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    })
    .catch(() => {
      // Not running inside Tauri (e.g. a plain browser): nothing to listen to.
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

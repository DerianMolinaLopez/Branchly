import type { DragEvent } from 'react';
import { requestMerge } from './actions';

/** Drag-and-drop of branches: drop a branch onto another to merge it. */
const MIME = 'application/x-branchly-branch';

export function branchDragProps(name: string) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(MIME, name);
      event.dataTransfer.setData('text/plain', name);
      event.dataTransfer.effectAllowed = 'move';
    },
  };
}

/** Props for an element that accepts a dropped branch to merge into `target`. */
export function branchDropProps(repoId: string, target: string, setOver: (over: boolean) => void) {
  return {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOver(true);
    },
    onDragLeave: () => {
      setOver(false);
    },
    onDrop: (event: DragEvent) => {
      setOver(false);
      const source = event.dataTransfer.getData(MIME);
      if (!source) return;
      event.preventDefault();
      requestMerge(repoId, source, target);
    },
  };
}

import type { ChangeKind } from '@/api';

/** Letter, label and color of each kind of file change. */
export const CHANGE_KIND: Record<ChangeKind, { letter: string; label: string; className: string }> =
  {
    added: { letter: 'A', label: 'Añadido', className: 'text-success' },
    untracked: { letter: 'U', label: 'Nuevo, sin seguimiento', className: 'text-success' },
    modified: { letter: 'M', label: 'Modificado', className: 'text-warning' },
    deleted: { letter: 'D', label: 'Eliminado', className: 'text-danger' },
    renamed: { letter: 'R', label: 'Renombrado', className: 'text-lane-1' },
    copied: { letter: 'C', label: 'Copiado', className: 'text-lane-5' },
    typeChange: { letter: 'T', label: 'Cambio de tipo', className: 'text-lane-5' },
    conflicted: { letter: '!', label: 'En conflicto', className: 'text-danger' },
  };

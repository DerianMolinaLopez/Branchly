import { useQuery } from '@tanstack/react-query';
import { keys, systemApi } from '@/api';
import { formatShortcut, SHORTCUTS } from '@/lib/shortcuts';
import { useSettings } from '@/stores/settings';
import { Dialog, Field, SegmentedControl } from '@/ui';

const FETCH_OPTIONS = [0, 5, 10, 15, 30];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const git = useQuery({
    queryKey: keys.gitVersion(),
    queryFn: systemApi.gitVersion,
    staleTime: Infinity,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Ajustes"
      width="md"
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Fetch automático"
          htmlFor="auto-fetch"
          hint="Trae los cambios de los remotos en segundo plano para los repositorios abiertos."
        >
          <select
            id="auto-fetch"
            value={settings.autoFetchMinutes}
            onChange={(e) => {
              settings.setAutoFetch(Number(e.target.value));
            }}
            className="h-8 rounded-control border border-line bg-canvas/60 px-2 text-base text-fg focus:border-accent"
          >
            {FETCH_OPTIONS.map((m) => (
              <option key={m} value={m} className="bg-raised">
                {m === 0 ? 'Desactivado' : `Cada ${m} minutos`}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-secondary">Vista de diffs por defecto</span>
          <SegmentedControl
            label="Vista de diffs"
            value={settings.diffMode}
            onChange={settings.setDiffMode}
            segments={[
              { value: 'unified', label: 'Unificada' },
              { value: 'split', label: 'Lado a lado' },
            ]}
          />
        </div>
        <div className="rounded-control border border-line bg-canvas/50 p-3 text-sm">
          <p className="text-fg-secondary">Git del sistema</p>
          <p className="mt-0.5 font-mono text-fg-muted">
            {git.isPending
              ? 'comprobando…'
              : (git.data ?? 'no encontrado: instala Git y reinicia Branchly')}
          </p>
        </div>
        <details className="text-sm">
          <summary className="cursor-default text-fg-secondary">Atajos de teclado</summary>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-fg-muted">
            {Object.entries(SHORTCUT_LABELS).map(([id, label]) => (
              <div key={id} className="contents">
                <dt>{label}</dt>
                <dd className="font-mono text-xs">
                  {formatShortcut(SHORTCUTS[id as keyof typeof SHORTCUTS]).join(' ')}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </Dialog>
  );
}

const SHORTCUT_LABELS: Partial<Record<keyof typeof SHORTCUTS, string>> = {
  palette: 'Paleta de comandos',
  openRepo: 'Abrir repositorio',
  cloneRepo: 'Clonar repositorio',
  fetch: 'Fetch',
  pull: 'Pull',
  push: 'Push',
  newBranch: 'Nueva rama',
  stash: 'Guardar en el stash',
  popStash: 'Aplicar el último stash',
  showChanges: 'Ir a los cambios',
  commit: 'Hacer commit',
  stageAll: 'Preparar todo',
  undo: 'Deshacer',
  search: 'Buscar commits',
  toggleDiffMode: 'Cambiar vista del diff',
  nextChange: 'Cambio siguiente',
  prevChange: 'Cambio anterior',
  closeTab: 'Cerrar pestaña',
  nextTab: 'Pestaña siguiente',
};

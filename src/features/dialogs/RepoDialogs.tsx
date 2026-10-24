import { FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GitError, repositoriesApi, systemApi, type Progress } from '@/api';
import { operationId } from '@/lib/id';
import { joinPath } from '@/features/home/openRepo';
import { useWorkspace } from '@/stores/workspace';
import { Button, Dialog, Field, Input, toast } from '@/ui';

function FolderField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex gap-2">
        <Input
          id={id}
          mono
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="/ruta/a/la/carpeta"
          className="flex-1"
        />
        <Button
          icon={<FolderOpen />}
          onClick={async () => {
            const path = await systemApi.pickFolder(label).catch(() => null);
            if (path) onChange(path);
          }}
        >
          Elegir…
        </Button>
      </div>
    </Field>
  );
}

export function CloneDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [parent, setParent] = useState('');
  const [folder, setFolder] = useState('');
  const [folderEdited, setFolderEdited] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (folderEdited) return;
    let alive = true;
    void repositoriesApi
      .suggestCloneFolder(url)
      .then((name) => {
        if (alive) setFolder(name ?? '');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url, folderEdited]);

  const dest = parent && folder ? joinPath(parent, folder) : '';
  const busy = opId !== null;

  const clone = async () => {
    if (!url.trim() || !dest) return;
    const id = operationId('clone');
    setOpId(id);
    setError(null);
    try {
      const info = await repositoriesApi.clone(url.trim(), dest, id, setProgress);
      useWorkspace.getState().openTab(info);
      toast.success(`Repositorio ${info.name} clonado`);
      onClose();
    } catch (raw) {
      const err = GitError.from(raw);
      if (err.code !== 'CANCELLED') setError(err.message);
    } finally {
      setOpId(null);
      setProgress(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Clonar repositorio"
      description="Usa HTTPS o SSH: Git aplicará tus credenciales y tu ssh-agent."
      footer={
        busy ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (opId) void repositoriesApi.cancelOperation(opId);
            }}
          >
            Cancelar clonado
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="clone-form"
              variant="primary"
              disabled={!url.trim() || !dest}
            >
              Clonar
            </Button>
          </>
        )
      }
    >
      <form
        id="clone-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void clone();
        }}
      >
        <Field label="URL del repositorio" htmlFor="clone-url">
          <Input
            id="clone-url"
            mono
            autoFocus
            disabled={busy}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
            placeholder="git@github.com:usuario/proyecto.git"
          />
        </Field>
        <FolderField
          id="clone-parent"
          label="Carpeta donde clonar"
          value={parent}
          onChange={setParent}
        />
        <Field
          label="Nombre de la carpeta"
          htmlFor="clone-folder"
          hint={dest ? `Se creará ${dest}` : undefined}
        >
          <Input
            id="clone-folder"
            mono
            disabled={busy}
            value={folder}
            onChange={(e) => {
              setFolder(e.target.value);
              setFolderEdited(true);
            }}
          />
        </Field>
        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-control border border-line bg-canvas/60 p-3"
          >
            <div className="flex justify-between text-sm">
              <span className="text-fg-secondary">{progress?.phase || 'Conectando…'}</span>
              {progress?.percent != null && (
                <span className="font-mono text-accent">{progress.percent}%</span>
              )}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-teal">
              <div
                className={
                  progress?.percent != null
                    ? 'h-full bg-accent transition-[width]'
                    : 'h-full w-1/3 animate-shimmer bg-accent'
                }
                style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
              />
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-control bg-danger-soft px-3 py-2 font-mono text-sm whitespace-pre-wrap text-danger"
          >
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function InitDialog({ onClose }: { onClose: () => void }) {
  const [parent, setParent] = useState('');
  const [name, setName] = useState('');
  const path = parent && name.trim() ? joinPath(parent, name.trim()) : parent;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Crear repositorio"
      description="Inicializa un repositorio Git vacío en una carpeta nueva o existente."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="init-form" variant="primary" loading={busy} disabled={!path}>
            Crear repositorio
          </Button>
        </>
      }
    >
      <form
        id="init-form"
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!path) return;
          setBusy(true);
          try {
            const info = await repositoriesApi.init(path);
            useWorkspace.getState().openTab(info);
            toast.success(`Repositorio ${info.name} creado`);
            onClose();
          } catch (raw) {
            toast.error('No se pudo crear el repositorio', {
              description: GitError.from(raw).message,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <FolderField id="init-parent" label="Carpeta" value={parent} onChange={setParent} />
        <Field
          label="Nueva subcarpeta"
          htmlFor="init-name"
          hint={path ? `Se inicializará ${path}` : 'Déjalo vacío para usar la carpeta elegida.'}
        >
          <Input
            id="init-name"
            mono
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="mi-proyecto (opcional)"
          />
        </Field>
      </form>
    </Dialog>
  );
}

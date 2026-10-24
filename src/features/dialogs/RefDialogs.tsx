import { useState, type ReactNode } from 'react';
import { branchesApi, stashApi, tagsApi } from '@/api';
import { mergeIntoCurrent, checkoutBranch } from '@/features/branches/actions';
import { runAction } from '@/features/repo/actions';
import { useCurrentBranch, useStatus } from '@/features/repo/queries';
import { Button, Checkbox, Dialog, Field, Input, Textarea } from '@/ui';
import type { DialogRequest } from './store';

type Props<K extends DialogRequest['kind']> = {
  request: Extract<DialogRequest, { kind: K }>;
  onClose: () => void;
};

/** Characters Git never accepts in ref names, flagged while typing. */
const INVALID_REF = /(^[-./])|(\.\.)|[\s~^:?*[\\]|(@\{)|(\/$)|(\.lock$)|(\.$)/;

function refError(name: string, what: string): string | null {
  if (!name) return null;
  return INVALID_REF.test(name)
    ? `Nombre de ${what} no válido: sin espacios ni ~ ^ : ? * [ \\ y sin «..»`
    : null;
}

function DialogForm({
  onSubmit,
  children,
}: {
  onSubmit: () => Promise<void>;
  children: (busy: boolean) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form id="dialog-form" onSubmit={(e) => void handle(e)} className="flex flex-col gap-4">
      {children(busy)}
    </form>
  );
}

function Footer({
  onClose,
  label,
  disabled,
}: {
  onClose: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" form="dialog-form" variant="primary" disabled={disabled}>
        {label}
      </Button>
    </>
  );
}

export function CreateBranchDialog({ request, onClose }: Props<'createBranch'>) {
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(true);
  const error = refError(name.trim(), 'rama');
  const valid = name.trim().length > 0 && !error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Nueva rama"
      description={request.start ? `Desde ${request.start.label}` : 'Desde el commit actual (HEAD)'}
      width="sm"
      footer={
        <Footer
          onClose={onClose}
          label={checkout ? 'Crear y cambiar' : 'Crear rama'}
          disabled={!valid}
        />
      }
    >
      <DialogForm
        onSubmit={async () => {
          if (!valid) return;
          const branch = name.trim();
          const result = await runAction(
            request.repoId,
            () => branchesApi.create(request.repoId, branch, request.start?.sha ?? null, checkout),
            {
              success: checkout
                ? `Cambiaste a la nueva rama «${branch}»`
                : `Rama «${branch}» creada`,
              errorTitle: 'No se pudo crear la rama',
            },
          );
          if (result) onClose();
        }}
      >
        {() => (
          <>
            <Field
              label="Nombre"
              htmlFor="branch-name"
              error={error}
              hint="Usa «/» para agrupar, por ejemplo feature/login."
            >
              <Input
                id="branch-name"
                mono
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder="feature/mi-cambio"
                aria-invalid={!!error}
              />
            </Field>
            <Checkbox
              checked={checkout}
              onCheckedChange={setCheckout}
              label="Cambiar a la rama después de crearla"
            />
          </>
        )}
      </DialogForm>
    </Dialog>
  );
}

export function RenameBranchDialog({ request, onClose }: Props<'renameBranch'>) {
  const [name, setName] = useState(request.name);
  const error = refError(name.trim(), 'rama');
  const valid = name.trim().length > 0 && !error && name.trim() !== request.name;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Renombrar «${request.name}»`}
      width="sm"
      footer={<Footer onClose={onClose} label="Renombrar" disabled={!valid} />}
    >
      <DialogForm
        onSubmit={async () => {
          if (!valid) return;
          const result = await runAction(
            request.repoId,
            () => branchesApi.rename(request.repoId, request.name, name.trim()),
            {
              success: `Rama renombrada a «${name.trim()}»`,
              errorTitle: 'No se pudo renombrar la rama',
            },
          );
          if (result) onClose();
        }}
      >
        {() => (
          <Field label="Nuevo nombre" htmlFor="branch-rename" error={error}>
            <Input
              id="branch-rename"
              mono
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              onFocus={(e) => {
                e.currentTarget.select();
              }}
              aria-invalid={!!error}
            />
          </Field>
        )}
      </DialogForm>
    </Dialog>
  );
}

export function CreateTagDialog({ request, onClose }: Props<'createTag'>) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const error = refError(name.trim(), 'etiqueta');
  const valid = name.trim().length > 0 && !error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Nueva etiqueta"
      description={`En el commit ${request.label}`}
      width="sm"
      footer={<Footer onClose={onClose} label="Crear etiqueta" disabled={!valid} />}
    >
      <DialogForm
        onSubmit={async () => {
          if (!valid) return;
          const result = await runAction(
            request.repoId,
            () => tagsApi.create(request.repoId, name.trim(), request.sha, message.trim() || null),
            {
              success: `Etiqueta ${name.trim()} creada`,
              errorTitle: 'No se pudo crear la etiqueta',
            },
          );
          if (result) onClose();
        }}
      >
        {() => (
          <>
            <Field label="Nombre" htmlFor="tag-name" error={error}>
              <Input
                id="tag-name"
                mono
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder="v1.0.0"
                aria-invalid={!!error}
              />
            </Field>
            <Field
              label="Mensaje"
              htmlFor="tag-message"
              hint="Con mensaje se crea una etiqueta anotada; sin él, una ligera."
            >
              <Textarea
                id="tag-message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
                placeholder="Notas de la versión (opcional)"
                rows={3}
              />
            </Field>
          </>
        )}
      </DialogForm>
    </Dialog>
  );
}

export function StashDialog({ request, onClose }: Props<'stash'>) {
  const status = useStatus(request.repoId);
  const [message, setMessage] = useState('');
  const [untracked, setUntracked] = useState(true);
  const tracked =
    (status.data?.staged.length ?? 0) +
    (status.data?.unstaged.filter((f) => f.kind !== 'untracked').length ?? 0);
  const newFiles = status.data?.unstaged.filter((f) => f.kind === 'untracked').length ?? 0;
  const nothing = tracked + (untracked ? newFiles : 0) === 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Guardar cambios en el stash"
      description="Los cambios se guardan aparte y el árbol de trabajo queda limpio."
      width="sm"
      footer={<Footer onClose={onClose} label="Guardar en el stash" disabled={nothing} />}
    >
      <DialogForm
        onSubmit={async () => {
          const result = await runAction(
            request.repoId,
            () => stashApi.save(request.repoId, message.trim() || null, untracked),
            {
              success: 'Cambios guardados en el stash',
              errorTitle: 'No se pudo guardar el stash',
            },
          );
          if (result) onClose();
        }}
      >
        {() => (
          <>
            <Field label="Mensaje" htmlFor="stash-message">
              <Input
                id="stash-message"
                autoFocus
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                }}
                placeholder="Qué estabas haciendo (opcional)"
              />
            </Field>
            <Checkbox
              checked={untracked}
              onCheckedChange={setUntracked}
              label="Incluir archivos nuevos sin seguimiento"
              description={newFiles > 0 ? `${newFiles} archivo(s) nuevo(s)` : undefined}
            />
            {nothing && <p className="text-sm text-fg-muted">No hay cambios que guardar.</p>}
          </>
        )}
      </DialogForm>
    </Dialog>
  );
}

export function MergeDialog({ request, onClose }: Props<'merge'>) {
  const current = useCurrentBranch(request.repoId);
  const [noFf, setNoFf] = useState(false);
  const needsCheckout = current?.name !== request.target;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Fusionar ramas"
      width="sm"
      footer={
        <Footer onClose={onClose} label={needsCheckout ? 'Cambiar y fusionar' : 'Fusionar'} />
      }
    >
      <DialogForm
        onSubmit={async () => {
          onClose();
          if (needsCheckout) {
            const switched = await checkoutBranch(request.repoId, request.target);
            if (!switched) return;
          }
          await mergeIntoCurrent(request.repoId, request.source, noFf);
        }}
      >
        {() => (
          <>
            <p className="text-base text-fg-secondary">
              Fusionar{' '}
              <code className="rounded-chip bg-canvas px-1 font-mono text-sm text-accent">
                {request.source}
              </code>{' '}
              en{' '}
              <code className="rounded-chip bg-canvas px-1 font-mono text-sm text-fg">
                {request.target}
              </code>
              .
            </p>
            {needsCheckout && (
              <p className="text-sm text-fg-muted">
                Primero se cambiará a «{request.target}», que no es la rama actual.
              </p>
            )}
            <Checkbox
              checked={noFf}
              onCheckedChange={setNoFf}
              label="Crear siempre un commit de merge (--no-ff)"
            />
          </>
        )}
      </DialogForm>
    </Dialog>
  );
}

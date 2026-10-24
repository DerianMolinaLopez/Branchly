import { GitCommitHorizontal } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { commitsApi, type WorkingTreeStatus } from '@/api';
import { cn } from '@/lib/cn';
import { SHORTCUTS } from '@/lib/shortcuts';
import { useHotkey } from '@/lib/useHotkey';
import { runAction } from '@/features/repo/actions';
import { useRepoActive } from '@/features/repo/context';
import { EMPTY_DRAFT, useDrafts } from '@/stores/drafts';
import { Button, Checkbox, Kbd, Textarea } from '@/ui';
import { composeMessage, splitMessage, SUMMARY_SOFT_LIMIT } from './message';

/** Event that asks the commit editor of a repository to take focus. */
export const FOCUS_COMMIT_EVENT = 'branchly:focus-commit';

export function CommitEditor({ repoId, status }: { repoId: string; status: WorkingTreeStatus }) {
  const draft = useDrafts((s) => s.drafts[repoId] ?? EMPTY_DRAFT);
  const update = useDrafts((s) => s.update);
  const clear = useDrafts((s) => s.clear);
  const summaryRef = useRef<HTMLInputElement>(null);
  const active = useRepoActive();
  const summaryId = useId();

  useEffect(() => {
    const onFocus = (event: Event) => {
      if ((event as CustomEvent<string>).detail === repoId) summaryRef.current?.focus();
    };
    window.addEventListener(FOCUS_COMMIT_EVENT, onFocus);
    return () => {
      window.removeEventListener(FOCUS_COMMIT_EVENT, onFocus);
    };
  }, [repoId]);

  const merging = status.state !== 'clean';
  const conflicts = status.conflicted.length;
  const staged = status.staged.length;
  const summary = draft.summary.trim();
  const canCommit = !merging && conflicts === 0 && summary.length > 0 && (draft.amend || staged > 0);

  const toggleAmend = async (amend: boolean) => {
    update(repoId, { amend });
    if (amend && !draft.summary && !draft.description) {
      const message = await commitsApi.headMessage(repoId).catch(() => null);
      if (message) update(repoId, splitMessage(message));
    } else if (!amend) {
      clear(repoId);
    }
  };

  const submit = async () => {
    if (!canCommit) return;
    const result = await runAction(repoId, () => commitsApi.commit(repoId, composeMessage(draft), draft.amend), {
      success: (m) => (draft.amend ? `Commit ${m.value.shortId} modificado` : `Commit ${m.value.shortId} creado`),
      errorTitle: 'No se pudo hacer el commit',
    });
    if (result) clear(repoId);
  };

  useHotkey(SHORTCUTS.commit, () => void submit(), active);

  const over = summary.length > SUMMARY_SOFT_LIMIT;
  const disabledReason = merging
    ? 'Termina la operación en curso con «Continuar»'
    : conflicts > 0
      ? 'Resuelve los conflictos antes de hacer commit'
      : !draft.amend && staged === 0
        ? 'Prepara algún cambio para hacer commit'
        : summary.length === 0
          ? 'Escribe un resumen'
          : null;

  return (
    <form
      className="shrink-0 border-t border-line bg-surface/80 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="relative">
        <label htmlFor={summaryId} className="sr-only">
          Resumen del commit
        </label>
        <input
          id={summaryId}
          ref={summaryRef}
          value={draft.summary}
          onChange={(e) => {
            update(repoId, { summary: e.target.value });
          }}
          placeholder="Resumen del commit"
          spellCheck
          className={cn(
            'h-9 w-full rounded-t-control border border-b-0 border-line bg-canvas/70 pr-14 pl-3 text-md text-fg placeholder:text-fg-subtle',
            'focus:border-accent focus-visible:outline-none',
          )}
        />
        <span
          className={cn(
            'absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-2xs tabular-nums',
            over ? 'text-warning' : 'text-fg-subtle',
          )}
          title={over ? `Se recomienda no pasar de ${SUMMARY_SOFT_LIMIT} caracteres` : undefined}
        >
          {summary.length}/{SUMMARY_SOFT_LIMIT}
        </span>
      </div>
      <Textarea
        value={draft.description}
        onChange={(e) => {
          update(repoId, { description: e.target.value });
        }}
        placeholder="Descripción (opcional)"
        aria-label="Descripción del commit"
        className="min-h-16 rounded-t-none"
        rows={3}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Checkbox
          checked={draft.amend}
          onCheckedChange={(checked) => void toggleAmend(checked)}
          label={<span className="text-sm">Modificar el último commit</span>}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-2.5 w-full"
        disabled={!canCommit}
        title={disabledReason ?? undefined}
        icon={<GitCommitHorizontal />}
      >
        <span className="flex-1 text-left">
          {draft.amend ? 'Modificar el commit' : staged > 0 ? `Hacer commit de ${staged} ${staged === 1 ? 'archivo' : 'archivos'}` : 'Hacer commit'}
        </span>
        <Kbd shortcut={SHORTCUTS.commit} className="[&>span]:border-accent-fg/20 [&>span]:bg-accent-fg/10 [&>span]:text-accent-fg" />
      </Button>
      {disabledReason && <p className="mt-1.5 text-center text-xs text-fg-subtle">{disabledReason}</p>}
    </form>
  );
}
EOF

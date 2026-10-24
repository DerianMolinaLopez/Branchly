import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FolderGit2, FolderOpen, FolderPlus, GitFork, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { keys, repositoriesApi, systemApi, type RecentRepo } from '@/api';
import { queryClient } from '@/app/queryClient';
import { cn } from '@/lib/cn';
import { SHORTCUTS } from '@/lib/shortcuts';
import { formatRelative } from '@/lib/time';
import { openDialog } from '@/features/dialogs/store';
import { IconButton, Kbd, SectionTitle, Skeleton } from '@/ui';
import { openRepository, pickAndOpenRepository } from './openRepo';

/** Start screen: open, clone or create a repository, or reopen a recent one. */
export function HomeScreen() {
  const recent = useQuery({ queryKey: keys.recent(), queryFn: repositoriesApi.recent });
  const git = useQuery({
    queryKey: keys.gitVersion(),
    queryFn: systemApi.gitVersion,
    staleTime: Infinity,
  });

  return (
    <div className="relative h-full overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 70% 10%, color-mix(in srgb, var(--color-teal) 70%, transparent), transparent 70%)',
        }}
      />
      <div className="relative mx-auto flex max-w-3xl flex-col px-8 pt-[12vh] pb-16">
        <div className="flex items-center gap-4">
          <img
            src="/logo.svg"
            alt=""
            className="size-14 drop-shadow-[0_0_24px_rgb(34_224_240_/_0.25)]"
            draggable={false}
          />
          <h1 className="font-mono text-display font-semibold tracking-tight text-fg">
            <span className="text-accent">&gt;</span> <TypedWord word="branchly" />
            <span className="animate-blink text-accent" aria-hidden>
              _
            </span>
          </h1>
        </div>
        <p className="mt-3 max-w-xl text-md text-fg-muted">
          Abre un repositorio para ver su historia, preparar cambios por bloques y sincronizar con
          tus remotos.
        </p>
        <hr className="accent-rule-left mt-8 mb-6 w-full" />

        {git.data === null && (
          <div
            role="alert"
            className="mb-6 flex gap-3 rounded-panel border border-warning/40 bg-warning-soft/50 p-4"
          >
            <TriangleAlert className="size-5 shrink-0 text-warning" />
            <div className="text-base">
              <p className="font-medium text-warning">No se encontró Git</p>
              <p className="text-fg-secondary">
                Branchly usa el Git de tu sistema para clonar, hacer fetch, pull, push y commits.
                Instálalo y reinicia la aplicación.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Action
            icon={<FolderOpen />}
            title="Abrir"
            description="Una carpeta con un repositorio Git"
            shortcut={SHORTCUTS.openRepo}
            onClick={() => void pickAndOpenRepository()}
          />
          <Action
            icon={<GitFork />}
            title="Clonar"
            description="Desde una URL HTTPS o SSH"
            shortcut={SHORTCUTS.cloneRepo}
            onClick={() => {
              openDialog({ kind: 'clone' });
            }}
          />
          <Action
            icon={<FolderPlus />}
            title="Crear"
            description="Un repositorio vacío nuevo"
            onClick={() => {
              openDialog({ kind: 'init' });
            }}
          />
        </div>

        <section className="mt-10">
          <SectionTitle count={recent.data?.length}>recientes</SectionTitle>
          <div className="mt-2">
            {recent.isPending ? (
              <div className="space-y-3 py-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : recent.data && recent.data.length > 0 ? (
              <ul className="divide-y divide-line/60">
                {recent.data.map((repo) => (
                  <RecentItem key={repo.path} repo={repo} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-base text-fg-subtle">
                Los repositorios que abras aparecerán aquí.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** The product name typed once on load: the home screen's single motion moment. */
function TypedWord({ word }: { word: string }) {
  return (
    <span aria-label={word}>
      {Array.from(word).map((char, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 + i * 0.055, duration: 0.01 }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

function Action({
  icon,
  title,
  description,
  shortcut,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-panel border border-line bg-surface/70 p-4 text-left transition-colors duration-(--duration-fast) hover:border-accent/50 hover:bg-raised [&_svg]:size-5"
    >
      <span className="flex w-full items-center justify-between text-accent">
        {icon}
        {shortcut && <Kbd shortcut={shortcut} />}
      </span>
      <span>
        <span className="block text-md font-medium text-fg">{title}</span>
        <span className="block text-sm text-fg-muted">{description}</span>
      </span>
    </button>
  );
}

function RecentItem({ repo }: { repo: RecentRepo }) {
  const remove = async () => {
    await repositoriesApi.removeRecent(repo.path).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: keys.recent() });
  };
  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        disabled={!repo.available}
        onClick={() => void openRepository(repo.path)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 text-left',
          repo.available ? 'hover:bg-raised' : 'opacity-50',
        )}
      >
        <FolderGit2
          className={cn('size-4 shrink-0', repo.available ? 'text-accent' : 'text-fg-subtle')}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-fg">{repo.name}</span>
          <span className="block truncate font-mono text-xs text-fg-subtle">{repo.path}</span>
        </span>
        <span className="shrink-0 text-sm text-fg-subtle">
          {repo.available ? formatRelative(repo.lastOpened) : 'no encontrado'}
        </span>
      </button>
      <IconButton
        size="sm"
        label="Quitar de recientes"
        icon={<X />}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => void remove()}
      />
    </li>
  );
}

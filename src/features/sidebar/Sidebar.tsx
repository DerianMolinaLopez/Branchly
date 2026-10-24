import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Folder,
  GitBranch,
  PackageOpen,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { remotesApi, stashApi, tagsApi, type Branch, type Stash, type Tag } from '@/api';
import { applyStash, stashLabel } from './stashActions';
import { cn } from '@/lib/cn';
import { copyText } from '@/lib/clipboard';
import { SHORTCUTS } from '@/lib/shortcuts';
import { formatRelative } from '@/lib/time';
import { BranchMenuItems } from '@/features/branches/BranchMenu';
import { checkoutBranch, checkoutRemoteBranch } from '@/features/branches/actions';
import { branchDragProps, branchDropProps } from '@/features/branches/dnd';
import { confirm } from '@/features/dialogs/confirm';
import { openDialog } from '@/features/dialogs/store';
import { runAction, runRemote } from '@/features/repo/actions';
import { focusCommit } from '@/features/repo/navigation';
import {
  useBranches,
  useCurrentBranch,
  useRemotes,
  useStashes,
  useTags,
} from '@/features/repo/queries';
import { useRepoUi, useWorkspace } from '@/stores/workspace';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  IconButton,
  Input,
  Skeleton,
  Tooltip,
} from '@/ui';
import { buildTree, matchesFilter, type TreeNode } from './tree';

/** Left column: local branches, remotes, stashes and tags. */
export function Sidebar({ repoId }: { repoId: string }) {
  const [filter, setFilter] = useState('');
  return (
    <nav
      aria-label="Referencias del repositorio"
      className="flex h-full min-h-0 flex-col bg-surface/50"
    >
      <div className="shrink-0 p-2">
        <Input
          icon={<Search />}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
          placeholder="Filtrar ramas, etiquetas…"
          aria-label="Filtrar referencias"
          className="h-7 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        <LocalBranches repoId={repoId} filter={filter} />
        <Remotes repoId={repoId} filter={filter} />
        <Stashes repoId={repoId} filter={filter} />
        <Tags repoId={repoId} filter={filter} />
      </div>
    </nav>
  );
}

function Section({
  title,
  count,
  actions,
  loading,
  empty,
  children,
}: {
  title: string;
  count: number | undefined;
  actions?: ReactNode;
  loading: boolean;
  empty: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-2">
      <div className="group flex h-7 items-center rounded-chip pr-0.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-chip pl-1 text-left font-mono text-sm text-fg-secondary hover:text-fg"
        >
          <ChevronRight
            className={cn(
              'size-3 text-fg-subtle transition-transform duration-(--duration-fast)',
              open && 'rotate-90',
            )}
          />
          <span className="text-accent" aria-hidden>
            &gt;
          </span>
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="text-xs text-fg-subtle">{count}</span>}
        </button>
        {actions && <span className="flex opacity-70 group-hover:opacity-100">{actions}</span>}
      </div>
      {open &&
        (loading ? (
          <div className="space-y-2 px-6 py-2">
            <Skeleton className="h-2.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        ) : count === 0 ? (
          <p className="px-6 py-1 text-sm text-fg-subtle">{empty}</p>
        ) : (
          <div role="tree">{children}</div>
        ))}
    </section>
  );
}

function Item({
  depth,
  icon,
  label,
  trailing,
  active,
  title,
  onClick,
  onDoubleClick,
  extraProps,
}: {
  depth: number;
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  title?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  extraProps?: Record<string, unknown>;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        'flex h-7 w-full min-w-0 items-center gap-1.5 rounded-chip pr-1.5 text-left text-base [&_svg]:size-3.5 [&_svg]:shrink-0',
        active ? 'bg-accent-soft text-fg' : 'text-fg-secondary hover:bg-raised hover:text-fg',
      )}
      {...extraProps}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{label}</span>
      {trailing}
    </button>
  );
}

function Folder_<T>({
  node,
  depth,
  render,
}: {
  node: TreeNode<T>;
  depth: number;
  render: (item: T, node: TreeNode<T>, depth: number) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  if (node.item !== null) return <>{render(node.item, node, depth)}</>;
  return (
    <div role="group">
      <Item
        depth={depth}
        icon={
          <>
            <ChevronRight
              className={cn('size-3! text-fg-subtle transition-transform', open && 'rotate-90')}
            />
            <Folder className="text-fg-subtle" />
          </>
        }
        label={node.name}
        onClick={() => {
          setOpen(!open);
        }}
        extraProps={{ 'aria-expanded': open }}
      />
      {open &&
        node.children.map((child) => (
          <Folder_ key={child.path} node={child} depth={depth + 1} render={render} />
        ))}
    </div>
  );
}

function AheadBehind({ branch }: { branch: Branch }) {
  if (branch.upstreamGone) {
    return (
      <Tooltip content="La rama remota asociada ya no existe">
        <TriangleAlert className="text-warning" />
      </Tooltip>
    );
  }
  if (!branch.upstream) return null;
  if (branch.ahead === 0 && branch.behind === 0) return null;
  return (
    <Tooltip
      content={`${branch.ahead} por delante y ${branch.behind} por detrás de ${branch.upstream}`}
    >
      <span className="flex items-center gap-1 font-mono text-2xs tabular-nums text-fg-muted [&_svg]:size-2.5!">
        {branch.ahead > 0 && (
          <span className="flex items-center text-accent">
            <ArrowUp />
            {branch.ahead}
          </span>
        )}
        {branch.behind > 0 && (
          <span className="flex items-center text-warning">
            <ArrowDown />
            {branch.behind}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

function BranchItem({
  repoId,
  branch,
  label,
  depth,
  current,
}: {
  repoId: string;
  branch: Branch;
  label: string;
  depth: number;
  current: string | null;
}) {
  const [over, setOver] = useState(false);
  const { selection } = useRepoUi(repoId);
  const selected = selection?.kind === 'commit' && selection.sha === branch.target;
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn('rounded-chip', over && 'ring-2 ring-accent')}
          {...(branch.isRemote ? {} : branchDropProps(repoId, branch.name, setOver))}
        >
          <Item
            depth={depth}
            active={selected}
            title={`${branch.name}\n${branch.summary}`}
            icon={
              branch.isHead ? (
                <Check className="text-accent" strokeWidth={3} />
              ) : (
                <GitBranch className="text-fg-subtle" />
              )
            }
            label={<span className={cn(branch.isHead && 'text-fg font-medium')}>{label}</span>}
            trailing={<AheadBehind branch={branch} />}
            onClick={() => void focusCommit(repoId, branch.target)}
            onDoubleClick={() => {
              if (branch.isHead) return;
              void (branch.isRemote
                ? checkoutRemoteBranch(repoId, branch.name)
                : checkoutBranch(repoId, branch.name));
            }}
            extraProps={branchDragProps(branch.name)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <BranchMenuItems
          repoId={repoId}
          branch={{
            name: branch.name,
            remote: branch.isRemote,
            isHead: branch.isHead,
            sha: branch.target,
          }}
          current={current}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function LocalBranches({ repoId, filter }: { repoId: string; filter: string }) {
  const branches = useBranches(repoId);
  const current = useCurrentBranch(repoId);
  const local = (branches.data ?? []).filter((b) => !b.isRemote && matchesFilter(b.name, filter));
  const tree = buildTree(local, (b) => b.name);
  return (
    <Section
      title="ramas"
      count={branches.data ? local.length : undefined}
      loading={branches.isPending}
      empty={filter ? 'Sin coincidencias' : 'Sin ramas todavía'}
      actions={
        <IconButton
          size="sm"
          label="Nueva rama"
          shortcut={SHORTCUTS.newBranch}
          icon={<Plus />}
          onClick={() => {
            openDialog({ kind: 'createBranch', repoId });
          }}
        />
      }
    >
      {tree.map((node) => (
        <Folder_
          key={node.path}
          node={node}
          depth={0}
          render={(branch, n, depth) => (
            <BranchItem
              key={branch.fullName}
              repoId={repoId}
              branch={branch}
              label={n.name}
              depth={depth}
              current={current?.name ?? null}
            />
          )}
        />
      ))}
    </Section>
  );
}

function Remotes({ repoId, filter }: { repoId: string; filter: string }) {
  const remotes = useRemotes(repoId);
  const branches = useBranches(repoId);
  const current = useCurrentBranch(repoId);
  const remoteBranches = (branches.data ?? []).filter(
    (b) => b.isRemote && matchesFilter(b.name, filter),
  );
  return (
    <Section
      title="remotos"
      count={remotes.data?.length}
      loading={remotes.isPending}
      empty="Este repositorio no tiene remotos"
    >
      {remotes.data?.map((remote) => {
        const own = remoteBranches.filter((b) => b.remote === remote.name);
        const tree = buildTree(own, (b) => b.name.slice(remote.name.length + 1));
        return (
          <RemoteGroup
            key={remote.name}
            name={remote.name}
            url={remote.fetchUrl ?? ''}
            count={own.length}
          >
            {tree.map((node) => (
              <Folder_
                key={node.path}
                node={node}
                depth={1}
                render={(branch, n, depth) => (
                  <BranchItem
                    key={branch.fullName}
                    repoId={repoId}
                    branch={branch}
                    label={n.name}
                    depth={depth}
                    current={current?.name ?? null}
                  />
                )}
              />
            ))}
          </RemoteGroup>
        );
      })}
    </Section>
  );
}

function RemoteGroup({
  name,
  url,
  count,
  children,
}: {
  name: string;
  url: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div role="group">
      <Item
        depth={0}
        title={url}
        icon={
          <>
            <ChevronRight
              className={cn('size-3! text-fg-subtle transition-transform', open && 'rotate-90')}
            />
            <Cloud className="text-fg-muted" />
          </>
        }
        label={name}
        trailing={<span className="text-2xs text-fg-subtle">{count}</span>}
        onClick={() => {
          setOpen(!open);
        }}
        extraProps={{ 'aria-expanded': open }}
      />
      {open && children}
    </div>
  );
}

function Stashes({ repoId, filter }: { repoId: string; filter: string }) {
  const stashes = useStashes(repoId);
  const select = useWorkspace((s) => s.select);
  const { selection } = useRepoUi(repoId);
  const items = (stashes.data ?? []).filter((s) => matchesFilter(s.message, filter));
  return (
    <Section
      title="stashes"
      count={stashes.data ? items.length : undefined}
      loading={stashes.isPending}
      empty="No hay cambios guardados en el stash"
      actions={
        <IconButton
          size="sm"
          label="Guardar cambios en el stash"
          shortcut={SHORTCUTS.stash}
          icon={<Plus />}
          onClick={() => {
            openDialog({ kind: 'stash', repoId });
          }}
        />
      }
    >
      {items.map((stash) => (
        <ContextMenu key={stash.id}>
          <ContextMenuTrigger>
            <div>
              <Item
                depth={0}
                active={selection?.kind === 'commit' && selection.sha === stash.id}
                icon={<Archive className="text-fg-subtle" />}
                title={stash.message}
                label={<span className="font-sans text-base">{stashLabel(stash)}</span>}
                trailing={
                  <span className="shrink-0 text-2xs text-fg-subtle">
                    {formatRelative(stash.timestamp)}
                  </span>
                }
                onClick={() => {
                  select(repoId, { kind: 'commit', sha: stash.id });
                }}
                onDoubleClick={() => void applyStash(repoId, stash, false)}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel>stash@{`{${stash.index}}`}</ContextMenuLabel>
            <ContextMenuItem
              icon={<PackageOpen />}
              onSelect={() => void applyStash(repoId, stash, true)}
            >
              Aplicar y eliminar (pop)
            </ContextMenuItem>
            <ContextMenuItem
              icon={<Archive />}
              onSelect={() => void applyStash(repoId, stash, false)}
            >
              Aplicar y conservar
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              danger
              icon={<Trash2 />}
              onSelect={() => void dropStash(repoId, stash)}
            >
              Eliminar…
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </Section>
  );
}

async function dropStash(repoId: string, stash: Stash) {
  const ok = await confirm({
    title: 'Eliminar el stash',
    description: 'Podrás recuperarlo con «Deshacer» justo después.',
    consequences: [stashLabel(stash)],
    confirmLabel: 'Eliminar stash',
  });
  if (ok)
    await runAction(repoId, () => stashApi.drop(repoId, stash.index), {
      success: 'Stash eliminado',
    });
}

function Tags({ repoId, filter }: { repoId: string; filter: string }) {
  const tags = useTags(repoId);
  const items = (tags.data ?? []).filter((t) => matchesFilter(t.name, filter));
  return (
    <Section
      title="etiquetas"
      count={tags.data ? items.length : undefined}
      loading={tags.isPending}
      empty="Sin etiquetas"
    >
      {items.map((tag) => (
        <ContextMenu key={tag.name}>
          <ContextMenuTrigger>
            <div>
              <Item
                depth={0}
                icon={<TagIcon className={tag.annotated ? 'text-accent' : 'text-fg-subtle'} />}
                title={tag.message ?? tag.name}
                label={tag.name}
                onClick={() => void focusCommit(repoId, tag.target)}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel>{tag.name}</ContextMenuLabel>
            <ContextMenuItem icon={<Upload />} onSelect={() => void pushTag(repoId, tag)}>
              Publicar en el remoto
            </ContextMenuItem>
            <ContextMenuItem icon={<Copy />} onSelect={() => void copyText(tag.name)}>
              Copiar nombre
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem danger icon={<Trash2 />} onSelect={() => void deleteTag(repoId, tag)}>
              Eliminar etiqueta…
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </Section>
  );
}

function pushTag(repoId: string, tag: Tag) {
  return runRemote(
    repoId,
    (opId, onProgress) => remotesApi.pushTag(repoId, tag.name, opId, onProgress),
    {
      kind: 'remote',
      label: `Publicando ${tag.name}…`,
      done: `Etiqueta ${tag.name} publicada`,
    },
  );
}

async function deleteTag(repoId: string, tag: Tag) {
  const ok = await confirm({
    title: `Eliminar la etiqueta «${tag.name}»`,
    description:
      'Se elimina solo en este repositorio; si ya la publicaste, sigue existiendo en el remoto.',
    confirmLabel: 'Eliminar etiqueta',
  });
  if (ok)
    await runAction(repoId, () => tagsApi.remove(repoId, tag.name), {
      success: `Etiqueta ${tag.name} eliminada`,
    });
}

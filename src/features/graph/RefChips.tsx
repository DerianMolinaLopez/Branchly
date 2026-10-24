import { Check, Cloud, Laptop, Tag as TagIcon, Crosshair } from 'lucide-react';
import { memo, useState } from 'react';
import type { RefLabel } from '@/api';
import { cn } from '@/lib/cn';
import { BranchMenuItems } from '@/features/branches/BranchMenu';
import { checkoutBranch, checkoutRemoteBranch } from '@/features/branches/actions';
import { branchDragProps, branchDropProps } from '@/features/branches/dnd';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, Tooltip } from '@/ui';
import { groupRefs, type RefGroup } from './refs';

interface RefChipsProps {
  repoId: string;
  labels: RefLabel[];
  sha: string;
  color: number;
  current: string | null;
}

/** Branch and tag chips of a commit; the first fits, the rest collapse into "+N". */
export const RefChips = memo(function RefChips({
  repoId,
  labels,
  sha,
  color,
  current,
}: RefChipsProps) {
  if (labels.length === 0) return null;
  const groups = groupRefs(labels);
  const [first, ...rest] = groups;
  if (!first) return null;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Chip repoId={repoId} group={first} sha={sha} color={color} current={current} />
      {rest.length > 0 && (
        <Tooltip
          content={
            <span className="flex flex-col gap-0.5 font-mono text-xs">
              {rest.map((g) => (
                <span key={g.key}>{g.name}</span>
              ))}
            </span>
          }
        >
          <span className="shrink-0 rounded-chip border border-line bg-raised px-1 font-mono text-2xs text-fg-muted">
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </div>
  );
});

function Chip({
  repoId,
  group,
  sha,
  color,
  current,
}: {
  repoId: string;
  group: RefGroup;
  sha: string;
  color: number;
  current: string | null;
}) {
  const [over, setOver] = useState(false);
  const laneColor = `var(--color-lane-${color % 8})`;
  const style = {
    borderColor: `color-mix(in srgb, ${laneColor} ${group.isHead ? 70 : 40}%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${laneColor} ${group.isHead ? 20 : 11}%, var(--color-canvas))`,
  };
  const title = [group.local?.name, ...group.remotes.map((r) => r.name), group.tag?.name]
    .filter(Boolean)
    .join(', ');

  const content = (
    <span
      title={title}
      style={style}
      className={cn(
        'inline-flex h-5 min-w-0 items-center gap-1 rounded-chip border px-1.5 font-mono text-xs text-fg [&_svg]:size-3 [&_svg]:shrink-0',
        over && 'ring-2 ring-accent',
      )}
    >
      {group.kind === 'tag' ? (
        <TagIcon className="text-fg-muted" />
      ) : group.kind === 'head' ? (
        <Crosshair className="text-accent" />
      ) : group.isHead ? (
        <Check className="text-accent" strokeWidth={3} />
      ) : null}
      <span className="truncate">{group.name}</span>
      {group.kind === 'branch' && (
        <span className="flex items-center gap-0.5 text-fg-muted">
          {group.local && group.remotes.length > 0 && <Laptop />}
          {group.remotes.length > 0 && <Cloud />}
        </span>
      )}
    </span>
  );

  if (group.kind !== 'branch') return content;

  const remoteOnly = group.local === null;
  const name = group.local?.name ?? group.remotes[0]?.name ?? group.name;
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <span
          className="flex min-w-0"
          {...branchDragProps(name)}
          {...(remoteOnly ? {} : branchDropProps(repoId, name, setOver))}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (group.isHead) return;
            void (remoteOnly ? checkoutRemoteBranch(repoId, name) : checkoutBranch(repoId, name));
          }}
        >
          {content}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <BranchMenuItems
          repoId={repoId}
          branch={{ name, remote: remoteOnly, isHead: group.isHead, sha }}
          current={current}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

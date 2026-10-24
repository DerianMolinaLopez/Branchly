import { cn } from '@/lib/cn';
import { formatShortcut } from '@/lib/shortcuts';

/** Renders a shortcut such as `mod+shift+p` as key caps. */
export function Kbd({ shortcut, className }: { shortcut: string; className?: string }) {
  const keys = formatShortcut(shortcut);
  return (
    <kbd className={cn('inline-flex items-center gap-0.5 font-sans', className)} aria-label={keys.join('+')}>
      {keys.map((key, i) => (
        <span
          key={`${key}-${i}`}
          className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-chip border border-line bg-canvas/70 px-1 text-2xs leading-none text-fg-muted"
        >
          {key}
        </span>
      ))}
    </kbd>
  );
}

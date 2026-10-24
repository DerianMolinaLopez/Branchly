import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Section heading with the terminal prompt prefix. */
export function SectionTitle({
  children,
  count,
  actions,
  className,
}: {
  children: ReactNode;
  count?: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-7 items-center gap-1.5', className)}>
      <h2 className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-sm font-medium text-fg-secondary">
        <span className="text-accent" aria-hidden>
          &gt;
        </span>
        <span className="truncate">{children}</span>
        {count !== undefined && <span className="text-xs font-normal text-fg-subtle">{count}</span>}
      </h2>
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </div>
  );
}

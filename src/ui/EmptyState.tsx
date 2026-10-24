import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Empty and error states: a terminal-style prompt with a blinking cursor,
 * a plain explanation and, when possible, the action that fixes it.
 */
export function EmptyState({
  title,
  description,
  action,
  tone = 'default',
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'error';
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}
    >
      <p className={cn('font-mono text-md', tone === 'error' ? 'text-danger' : 'text-fg-secondary')}>
        <span className={tone === 'error' ? 'text-danger' : 'text-accent'}>&gt;</span> {title}
        <span className="ml-0.5 animate-blink text-accent" aria-hidden>
          _
        </span>
      </p>
      {description && <div className="max-w-sm text-base text-fg-muted">{description}</div>}
      {action}
    </div>
  );
}

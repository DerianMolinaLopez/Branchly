import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  shortcut?: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger' | 'accent';
  loading?: boolean;
  active?: boolean;
}

/** A square icon-only button with a tooltip naming it (and its shortcut). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, icon, size = 'md', tone = 'default', loading, active, className, ...props },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors duration-(--duration-fast)',
          'hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:opacity-40',
          size === 'sm' ? 'size-6 [&_svg]:size-3.5' : 'size-8 [&_svg]:size-4',
          tone === 'danger' && 'hover:bg-danger-soft hover:text-danger',
          tone === 'accent' && 'text-accent hover:bg-accent-soft hover:text-accent',
          active && 'bg-accent-soft text-accent',
          className,
        )}
        {...props}
      >
        {loading ? <Spinner /> : icon}
      </button>
    </Tooltip>
  );
});

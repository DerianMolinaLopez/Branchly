import { cn } from '@/lib/cn';

/**
 * Loading indicator. Decorative by default (its container already reports the
 * busy state, e.g. `aria-busy` or a status toast); pass `label` to announce it.
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

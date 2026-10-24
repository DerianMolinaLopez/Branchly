import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-shimmer rounded-chip bg-teal/70', className)} />;
}

/** Placeholder rows for lists while data loads. */
export function SkeletonRows({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={cn('flex flex-col gap-2.5 p-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className={cn('h-3', i % 3 === 0 ? 'w-2/3' : i % 3 === 1 ? 'w-1/2' : 'w-3/4')} />
        </div>
      ))}
    </div>
  );
}

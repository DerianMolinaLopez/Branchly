import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** A small group of mutually exclusive toggle buttons. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  segments: Segment<T>[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-control border border-line bg-canvas/50 p-0.5"
    >
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          aria-checked={segment.value === value}
          title={segment.title}
          onClick={() => {
            onChange(segment.value);
          }}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-chip px-2 text-sm transition-colors duration-(--duration-fast) [&_svg]:size-3.5',
            segment.value === value ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg',
          )}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}

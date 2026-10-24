import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * Vertical splitter between two panes. Drag to resize; arrow keys adjust by
 * 16px for keyboard users. `direction` is +1 when dragging right grows the
 * pane and -1 when it shrinks it (a pane on the right side).
 */
export function ResizeHandle({
  value,
  onChange,
  direction = 1,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  direction?: 1 | -1;
  label: string;
}) {
  const start = useRef<{ x: number; value: number } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      start.current = { x: event.clientX, value };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [value],
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!start.current) return;
      onChange(start.current.value + (event.clientX - start.current.x) * direction);
    },
    [direction, onChange],
  );
  const onPointerUp = useCallback(() => {
    start.current = null;
  }, []);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') onChange(value - 16 * direction);
      if (event.key === 'ArrowRight') onChange(value + 16 * direction);
    },
    [direction, onChange, value],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none',
        'focus-visible:outline-none',
      )}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors duration-(--duration-fast) group-hover:bg-accent/60 group-focus-visible:bg-accent group-active:bg-accent" />
    </div>
  );
}

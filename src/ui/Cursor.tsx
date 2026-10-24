import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Blinking terminal cursor. A single shared timer toggles every mounted
 * cursor twice per second, instead of an infinite CSS animation: WebKitGTK
 * drives those at full frame rate and keeps the CPU busy while idle.
 *
 * Like terminals do, the cursor stops blinking (and stays solid) after a few
 * seconds without user input, so an idle window costs no CPU; any pointer or
 * key activity resumes it. It never blinks when the window is hidden or the
 * user prefers reduced motion.
 */
const BLINK_MS = 530;
const IDLE_MS = 8_000;

const cursors = new Set<HTMLElement>();
let timer: number | undefined;
let visible = true;
let lastActivity = Date.now();

function show(on: boolean) {
  visible = on;
  for (const el of cursors) el.style.visibility = on ? 'visible' : 'hidden';
}

function tick() {
  if (Date.now() - lastActivity > IDLE_MS) {
    stop();
    return;
  }
  show(!visible);
}

function stop() {
  if (timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
  show(true);
}

function sync() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const idle = Date.now() - lastActivity > IDLE_MS;
  const shouldRun = cursors.size > 0 && !document.hidden && !reduced && !idle;
  if (shouldRun && timer === undefined) {
    timer = window.setInterval(tick, BLINK_MS);
  } else if (!shouldRun) {
    stop();
  }
}

function onActivity() {
  lastActivity = Date.now();
  if (timer === undefined && cursors.size > 0) sync();
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', sync);
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) {
    window.addEventListener(type, onActivity, { passive: true });
  }
}

export function Cursor({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    cursors.add(el);
    sync();
    return () => {
      cursors.delete(el);
      sync();
    };
  }, []);
  return (
    <span ref={ref} aria-hidden className={cn('text-accent', className)}>
      _
    </span>
  );
}

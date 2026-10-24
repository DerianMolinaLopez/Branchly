import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';
import { useToasts, type Toast } from './toast';

const icons = {
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <CircleAlert className="size-4 text-danger" />,
  info: <Info className="size-4 text-accent" />,
  progress: <Spinner className="text-accent" />,
};

/** Bottom-right stack of notifications, announced to screen readers. */
export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  return (
    <section
      aria-label="Notificaciones"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </section>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToasts((state) => state.dismiss);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (toast.duration === 0 || paused) return;
    const timer = window.setTimeout(() => {
      dismiss(toast.id);
    }, toast.duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [dismiss, paused, toast.duration, toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-panel border bg-raised shadow-overlay',
        toast.kind === 'error' ? 'border-danger/40' : 'border-line-strong',
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
          {icons[toast.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-fg">{toast.title}</p>
          {toast.description && (
            <p
              className="mt-0.5 line-clamp-4 font-mono text-xs break-words whitespace-pre-line text-fg-muted"
              data-selectable
            >
              {toast.description}
            </p>
          )}
        </div>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
            className="shrink-0 rounded-chip px-2 py-0.5 text-sm font-medium text-accent hover:bg-accent-soft"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="Cerrar notificación"
          onClick={() => {
            dismiss(toast.id);
          }}
          className="-mr-1 shrink-0 rounded-chip p-0.5 text-fg-subtle hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {toast.kind === 'progress' && (
        <div className="h-0.5 w-full bg-teal">
          {typeof toast.progress === 'number' ? (
            <div
              className="h-full bg-accent transition-[width] duration-(--duration-base)"
              style={{ width: `${toast.progress}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-shimmer bg-accent" />
          )}
        </div>
      )}
    </motion.div>
  );
}

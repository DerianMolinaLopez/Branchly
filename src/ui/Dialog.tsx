import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Element to focus first instead of the first focusable one. */
  onOpenAutoFocus?: (event: Event) => void;
}

const widths = { sm: 'w-[400px]', md: 'w-[480px]', lg: 'w-[620px]' };

/** Modal dialog with title, optional description, body and footer. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
  onOpenAutoFocus,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-canvas/70 backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <DialogPrimitive.Content
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[85vh] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2',
            'flex flex-col overflow-hidden rounded-panel border border-line-strong bg-raised shadow-overlay',
            'data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
            widths[width],
          )}
        >
          <div className="accent-rule absolute inset-x-0 top-0" aria-hidden />
          <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold text-fg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-base text-fg-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="-mr-1.5 rounded-control p-1 text-fg-muted hover:bg-raised-hover hover:text-fg"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          {children && <div className="min-h-0 overflow-y-auto px-5 pb-4">{children}</div>}
          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface/60 px-5 py-3">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

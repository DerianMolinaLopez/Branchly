import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const fieldBase =
  'w-full rounded-control border border-line bg-canvas/60 text-fg placeholder:text-fg-subtle ' +
  'transition-colors duration-(--duration-fast) hover:border-line-strong ' +
  'focus:border-accent focus:bg-canvas focus:shadow-[0_0_0_3px_var(--color-accent-faint)] focus-visible:outline-none ' +
  'disabled:opacity-50 aria-invalid:border-danger';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, mono, ...props },
  ref,
) {
  if (!icon) {
    return (
      <input
        ref={ref}
        spellCheck={false}
        className={cn(fieldBase, 'h-8 px-2.5 text-base', mono && 'font-mono text-sm', className)}
        {...props}
      />
    );
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle [&_svg]:size-3.5">
        {icon}
      </span>
      <input
        ref={ref}
        spellCheck={false}
        className={cn(fieldBase, 'h-8 pr-2.5 pl-8 text-base', mono && 'font-mono text-sm', className)}
        {...props}
      />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldBase, 'min-h-20 resize-none px-2.5 py-2 text-base', className)}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

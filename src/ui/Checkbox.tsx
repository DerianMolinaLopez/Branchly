import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: CheckboxProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          onCheckedChange(!checked);
        }}
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-chip border transition-colors duration-(--duration-fast)',
          checked
            ? 'border-accent bg-accent text-accent-fg'
            : 'border-line-strong bg-canvas/60 hover:border-accent',
          'disabled:opacity-50',
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </button>
      <label htmlFor={id} className="flex flex-col text-base text-fg-secondary">
        {label}
        {description && <span className="text-sm text-fg-muted">{description}</span>}
      </label>
    </div>
  );
}

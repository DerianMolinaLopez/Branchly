import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium ' +
    'transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-45 ' +
    '[&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-[0_0_0_1px_var(--color-accent),0_0_16px_var(--color-accent-soft)] disabled:bg-teal disabled:text-fg-muted disabled:shadow-none disabled:opacity-100',
        secondary:
          'bg-raised text-fg-secondary border border-line hover:bg-raised-hover hover:text-fg hover:border-line-strong',
        ghost: 'text-fg-secondary hover:bg-raised hover:text-fg',
        danger: 'bg-danger text-accent-fg hover:bg-danger-hover',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
      },
      size: {
        sm: 'h-7 px-2.5 text-sm',
        md: 'h-8 px-3 text-base',
        lg: 'h-10 px-4 text-md',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    icon,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : (props.type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : icon}
          {children}
        </>
      )}
    </Component>
  );
});

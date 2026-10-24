import { colorIndex, initials } from '@/lib/avatar';
import { cn } from '@/lib/cn';

const sizes = { sm: 'size-5 text-[9px]', md: 'size-6 text-2xs', lg: 'size-9 text-sm' };

/** Initials on a tint of the lane color derived from the author's email. */
export function Avatar({
  name,
  email,
  size = 'md',
  className,
}: {
  name: string;
  email: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const color = `var(--color-lane-${colorIndex(email || name)})`;
  return (
    <span
      aria-hidden
      title={`${name} <${email}>`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight',
        sizes[size],
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 16%, var(--color-canvas))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { Kbd } from './Kbd';

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string | undefined;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

/** A short label, optionally with the shortcut of the action. */
export function Tooltip({ content, shortcut, side = 'bottom', children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex max-w-80 items-center gap-2 rounded-control border border-line bg-raised px-2 py-1 text-sm text-fg-secondary shadow-overlay data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in"
        >
          <span>{content}</span>
          {shortcut && <Kbd shortcut={shortcut} />}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

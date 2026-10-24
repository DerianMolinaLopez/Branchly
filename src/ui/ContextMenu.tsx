import * as Menu from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Kbd } from './Kbd';
import { menuContent, menuItem, menuItemDanger, menuLabel, menuSeparator } from './menuStyles';

export const ContextMenu = Menu.Root;

export function ContextMenuTrigger({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <Menu.Trigger asChild disabled={disabled}>
      {children}
    </Menu.Trigger>
  );
}

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <Menu.Portal>
      <Menu.Content className={menuContent} collisionPadding={8}>
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

export function ContextMenuItem({ icon, shortcut, danger, disabled, onSelect, children }: MenuItemProps) {
  return (
    <Menu.Item disabled={disabled} onSelect={onSelect} className={cn(menuItem, danger && menuItemDanger)}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <Kbd shortcut={shortcut} />}
    </Menu.Item>
  );
}

export function ContextMenuSeparator() {
  return <Menu.Separator className={menuSeparator} />;
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className={cn(menuLabel, 'truncate')}>{children}</Menu.Label>;
}

export function ContextMenuSub({
  icon,
  label,
  danger,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger className={cn(menuItem, danger && menuItemDanger, 'data-[state=open]:bg-accent-soft')}>
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent className={menuContent} sideOffset={4} collisionPadding={8}>
          {children}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

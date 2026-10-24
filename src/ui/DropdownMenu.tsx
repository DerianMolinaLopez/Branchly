import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Kbd } from './Kbd';
import { menuContent, menuItem, menuItemDanger, menuLabel, menuSeparator } from './menuStyles';
import type { MenuItemProps } from './ContextMenu';

export const DropdownMenu = Menu.Root;

export function DropdownMenuTrigger({ children }: { children: ReactNode }) {
  return <Menu.Trigger asChild>{children}</Menu.Trigger>;
}

export function DropdownMenuContent({
  children,
  align = 'start',
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Menu.Portal>
      <Menu.Content className={menuContent} align={align} sideOffset={6} collisionPadding={8}>
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ icon, shortcut, danger, disabled, onSelect, children }: MenuItemProps) {
  return (
    <Menu.Item disabled={disabled} onSelect={onSelect} className={cn(menuItem, danger && menuItemDanger)}>
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <Kbd shortcut={shortcut} />}
    </Menu.Item>
  );
}

export function DropdownMenuCheckItem({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Menu.CheckboxItem checked={checked} onSelect={onSelect} className={cn(menuItem, 'pl-7')}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex">
        <Check />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className={menuSeparator} />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className={menuLabel}>{children}</Menu.Label>;
}

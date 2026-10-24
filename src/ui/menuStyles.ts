/** Classes shared by context menus and dropdown menus. */
export const menuContent =
  'z-50 min-w-52 overflow-hidden rounded-control border border-line bg-raised p-1 text-base text-fg-secondary ' +
  'shadow-overlay data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';

export const menuItem =
  'relative flex h-7 cursor-default items-center gap-2 rounded-chip px-2 outline-none select-none ' +
  'data-[highlighted]:bg-accent-soft data-[highlighted]:text-fg data-[disabled]:pointer-events-none ' +
  'data-[disabled]:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-fg-muted ' +
  'data-[highlighted]:[&_svg]:text-accent';

export const menuItemDanger =
  'text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger [&_svg]:text-danger data-[highlighted]:[&_svg]:text-danger';

export const menuSeparator = 'my-1 h-px bg-line';

export const menuLabel = 'px-2 pt-1.5 pb-1 font-mono text-xs text-fg-subtle';

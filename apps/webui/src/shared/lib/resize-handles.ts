export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ResizeHandle {
  direction: ResizeDirection;
  className: string;
}

export const RESIZE_HANDLES: ResizeHandle[] = [
  { direction: 'n', className: 'top-0 right-2 left-2 h-1 cursor-ns-resize' },
  { direction: 's', className: 'right-2 bottom-0 left-2 h-1 cursor-ns-resize' },
  { direction: 'w', className: 'top-2 bottom-2 left-0 w-1 cursor-ew-resize' },
  { direction: 'e', className: 'top-2 right-0 bottom-2 w-1 cursor-ew-resize' },
  { direction: 'nw', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { direction: 'ne', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { direction: 'se', className: 'right-0 bottom-0 size-3 cursor-nwse-resize' },
];

import type { ReactNode } from 'react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { contentHeight, GRID_STEP, type GridEntry, type GridRect, widthScale } from './grid-math';
import { SlotGridItem } from './slot-grid-item';
import { useElementSize } from './use-element-size';
import { useSlotInteraction } from './use-slot-interaction';

export interface SlotGridProps {
  entries: GridEntry[];
  /** Width the entries were authored on; the grid fills other widths proportionally. */
  referenceWidth?: number;
  editable?: boolean;
  selectedId?: string | null;
  /** false disables hover chrome (used for outer widgets while a primitive is active). */
  hoverEnabled?: boolean;
  /** false keeps resize handles only for the active item, not on hover. */
  handlesOnHover?: boolean;
  /** Item drag only starts inside this selector; omit to drag from the whole item. */
  dragHandleSelector?: string;
  variant?: 'plain' | 'card';
  className?: string;
  onSelect?: (id: string) => void;
  onBackgroundClick?: () => void;
  onCommit?: (next: Array<{ id: string; rect: GridRect }>) => void;
  renderItem: (entry: GridEntry) => ReactNode;
  label?: (entry: GridEntry) => string;
}

const GRID_LINE = 'color-mix(in oklab, var(--border) 80%, transparent)';

export function SlotGrid({
  entries,
  referenceWidth = 0,
  editable = false,
  selectedId = null,
  hoverEnabled = true,
  handlesOnHover = true,
  dragHandleSelector,
  variant = 'plain',
  className,
  onSelect,
  onBackgroundClick,
  onCommit,
  renderItem,
  label,
}: SlotGridProps): ReactNode {
  const { ref: canvasRef, width } = useElementSize<HTMLDivElement>();
  const { ref: scrollRef } = useElementSize<HTMLDivElement>();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const scale = widthScale(width, referenceWidth);
  const interaction = useSlotInteraction({
    canvasRef,
    scrollRef,
    entries,
    width,
    scale,
    editable,
    dragHandleSelector,
    onCommit,
  });
  const display = interaction.session ? interaction.session.layout : entries;
  const canvasHeight = contentHeight(display);
  const showGrid = editable && width > 0 && interaction.session !== null;
  const vertical = `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px)`;
  const horizontal = `linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px)`;
  const gridStyle = {
    backgroundImage: `${vertical}, ${horizontal}`,
    backgroundSize: `${GRID_STEP * scale}px ${GRID_STEP}px`,
  };

  return (
    <div
      ref={scrollRef}
      className={cn(
        'relative min-h-0 overflow-auto',
        interaction.session && 'select-none',
        interaction.session?.gesture === 'move' && 'cursor-grabbing',
        className,
      )}
      onPointerDown={(event) => {
        const canvas = canvasRef.current;
        if (event.target === event.currentTarget || event.target === canvas) {
          onBackgroundClick?.();
        }
      }}
    >
      <div
        ref={canvasRef}
        className="relative w-full"
        style={{ height: canvasHeight > 0 ? canvasHeight : undefined, minHeight: '100%' }}
      >
        {showGrid ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={gridStyle}
          />
        ) : null}
        {width > 0
          ? display.map((entry) => (
              <SlotGridItem
                key={entry.id}
                entry={entry}
                scale={scale}
                editable={editable}
                selected={editable && selectedId === entry.id}
                active={interaction.session?.id === entry.id}
                hovered={editable && hoverEnabled && hoveredId === entry.id}
                variant={variant}
                label={variant === 'card' ? label?.(entry) : undefined}
                handlesOnHover={handlesOnHover}
                onHoverChange={(next) => {
                  if (!interaction.session) {
                    setHoveredId(next ? entry.id : null);
                  }
                }}
                onPointerDown={(event) => {
                  onSelect?.(entry.id);
                  interaction.begin(event, entry, 'move');
                }}
                onClick={onSelect ? () => onSelect(entry.id) : undefined}
                onResizeStart={(event, direction) => interaction.begin(event, entry, direction)}
              >
                {renderItem(entry)}
              </SlotGridItem>
            ))
          : null}
      </div>
    </div>
  );
}

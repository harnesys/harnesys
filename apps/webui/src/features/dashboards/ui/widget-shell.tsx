import type { DashboardWidget, PrimitiveId, WidgetDoc } from '@harnesys/contracts';
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
  UploadIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { downloadWidgetDoc, readWidgetDocFile } from '@/features/dashboards/model/widget-transfer';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { toast } from '@/shared/ui/toast';
import { findIcon } from '../model/icon-options';
import { palettePrimitives, primitiveIcon } from '../model/widget-form';
import { ApproveWidgetDialog } from './approve-widget-dialog';

interface WidgetShellProps {
  widget: DashboardWidget;
  editMode: boolean;
  selected: boolean;
  /** The widget itself is the active element; an active primitive hides the widget frame. */
  highlighted: boolean;
  children: React.ReactNode;
  onSelect: (widgetId: string) => void;
  onRemove: (widgetId: string) => void;
  onActivate: (widgetId: string) => void;
  onRefresh: (widgetId: string) => void;
  onAddPrimitive: (primitive: PrimitiveId) => void;
  onDuplicate: (widget: DashboardWidget) => void;
  onImport: (widgetId: string, doc: WidgetDoc) => void;
}

/**
 * Card chrome around a rendered widget. The header is the grid drag handle and
 * the widget menu owns duplicate, JSON transfer, approval and removal.
 */
export function WidgetShell({
  widget,
  editMode,
  selected,
  highlighted,
  children,
  onSelect,
  onRemove,
  onActivate,
  onRefresh,
  onAddPrimitive,
  onDuplicate,
  onImport,
}: WidgetShellProps) {
  const [approveOpen, setApproveOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draft = widget.status === 'draft';
  const WidgetIcon = findIcon(widget.doc.icon);

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return;
    }
    const result = await readWidgetDocFile(file);
    if (!result.doc) {
      toast.add({ title: `Import failed: ${result.error ?? 'invalid document'}`, type: 'error' });
      return;
    }
    onImport(widget.id, result.doc);
    toast.add({ title: `Imported ${result.doc.title} as a draft`, type: 'success' });
  };

  return (
    // The card hosts nested interactive controls (menu, action buttons), so a
    // real <button> root is invalid HTML; role=button keeps it accessible.
    // biome-ignore lint/a11y/useSemanticElements: nested buttons forbid a <button> root
    <div
      className={cn(
        'group/shell relative flex h-full flex-col overflow-hidden rounded-xl border bg-card',
        draft && 'border-dashed',
        highlighted && 'ring-1 ring-live/50',
      )}
      data-testid={`dashboard-widget-${widget.id}`}
      data-selected={selected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={editMode ? () => onSelect(widget.id) : undefined}
      onKeyDown={
        editMode
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                onSelect(widget.id);
              }
            }
          : undefined
      }
    >
      <div
        className={cn(
          'dashboard-widget-drag-handle flex items-center gap-1.5 border-b bg-muted/40 px-2 py-1.5',
          editMode ? 'cursor-grab touch-none select-none active:cursor-grabbing' : 'cursor-default',
        )}
      >
        <GripVerticalIcon
          className={cn(
            'size-3 shrink-0 text-muted-foreground',
            editMode ? 'opacity-100' : 'opacity-0',
          )}
        />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {WidgetIcon ? <WidgetIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
          <span className="truncate font-medium text-xs">{widget.doc.title}</span>
        </span>
        {draft ? (
          <Badge variant="secondary" className="shrink-0">
            Draft
          </Badge>
        ) : null}
        {selected ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Add primitive"
                  title="Add primitive"
                  onClick={(event) => event.stopPropagation()}
                />
              }
            >
              <PlusIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {palettePrimitives().map((primitive) => {
                const Icon = primitiveIcon(primitive.id);
                return (
                  <DropdownMenuItem
                    key={primitive.id}
                    data-testid={`add-primitive-${primitive.id}`}
                    onClick={() => onAddPrimitive(primitive.id)}
                  >
                    <Icon />
                    <span className="flex-1">{primitive.title}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {primitive.layout.defaultW}×{primitive.layout.defaultH}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Widget menu"
                className="text-muted-foreground"
                onClick={(event) => event.stopPropagation()}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {draft ? (
              <DropdownMenuItem onClick={() => setApproveOpen(true)}>
                <CheckIcon /> Review and approve
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => onDuplicate(widget)}>
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadWidgetDoc(widget.doc)}>
              <DownloadIcon /> Export JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <UploadIcon /> Import JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRefresh(widget.id)}>
              <RefreshCwIcon /> Refresh
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void alert
                  .confirm({
                    title: `Delete widget "${widget.doc.title}"?`,
                    description:
                      'The widget and its persisted state are removed from the dashboard.',
                    confirmText: 'Delete widget',
                    variant: 'destructive',
                  })
                  .then((confirmed) => {
                    if (confirmed) {
                      onRemove(widget.id);
                    }
                  });
              }}
            >
              <TrashIcon /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import widget JSON"
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2">{children}</div>
      <ApproveWidgetDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={widget.doc.title}
        orgId={widget.orgId}
        doc={widget.doc}
        pending={false}
        onConfirm={() => {
          onActivate(widget.id);
          setApproveOpen(false);
        }}
      />
    </div>
  );
}

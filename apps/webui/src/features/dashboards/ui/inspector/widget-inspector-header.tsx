import type { WidgetDoc } from '@harnesys/contracts';
import {
  BracesIcon,
  CheckIcon,
  Redo2Icon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import type { WidgetDraft } from '../../model/inspector-store';

interface WidgetInspectorHeaderProps {
  doc: WidgetDoc;
  draft: WidgetDraft | null;
  isDraftStatus: boolean;
  dirty: boolean;
  saving: boolean;
  approving: boolean;
  deleting: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onEditJson: () => void;
  onApprove: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}

export function WidgetInspectorHeader({
  doc,
  draft,
  isDraftStatus,
  dirty,
  saving,
  approving,
  deleting,
  onUndo,
  onRedo,
  onEditJson,
  onApprove,
  onSave,
  onDiscard,
  onDelete,
  onDeselect,
}: WidgetInspectorHeaderProps): ReactNode {
  return (
    <div className="flex items-center gap-1 border-border/40 border-b px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate font-medium text-[13px]">{doc.title}</span>
      {isDraftStatus ? (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase">
          draft
        </span>
      ) : null}
      {dirty ? (
        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary uppercase">
          unsaved
        </span>
      ) : null}
      <HeaderIconButton label="Undo" disabled={!draft || draft.past.length === 0} onClick={onUndo}>
        <Undo2Icon />
      </HeaderIconButton>
      <HeaderIconButton
        label="Redo"
        disabled={!draft || draft.future.length === 0}
        onClick={onRedo}
      >
        <Redo2Icon />
      </HeaderIconButton>
      <HeaderIconButton label="Edit JSON" onClick={onEditJson}>
        <BracesIcon />
      </HeaderIconButton>
      {isDraftStatus ? (
        <HeaderIconButton
          label={dirty ? 'Save the draft before approving it' : 'Review and approve'}
          disabled={approving || dirty}
          onClick={onApprove}
        >
          <CheckIcon />
        </HeaderIconButton>
      ) : null}
      <HeaderIconButton
        label="Save changes"
        disabled={!dirty || saving || doc.title.trim() === ''}
        onClick={onSave}
      >
        <SaveIcon />
      </HeaderIconButton>
      {dirty ? (
        <HeaderIconButton label="Discard unsaved edits" onClick={onDiscard}>
          <RotateCcwIcon />
        </HeaderIconButton>
      ) : null}
      <HeaderIconButton label="Delete widget" disabled={deleting} destructive onClick={onDelete}>
        <Trash2Icon />
      </HeaderIconButton>
      <HeaderIconButton label="Deselect widget" onClick={onDeselect}>
        <XIcon />
      </HeaderIconButton>
    </div>
  );
}

function HeaderIconButton({
  label,
  disabled,
  destructive,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(destructive && 'text-destructive hover:text-destructive')}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

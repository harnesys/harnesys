import type { UpdateIssueBoardBody } from '@harnesys/contracts';
import { Columns3Icon, TagIcon, WorkflowIcon } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAgentStore } from '@/entities/agent';
import { useIssueBoardStore, useIssueLabelStore } from '@/entities/issue';
import {
  composePrefillFromBoard,
  openComposeTeamPresetDialog,
} from '@/features/preset-marketplace';
import {
  entityColorTintClass,
  entityColorTintStyle,
  isCustomColor,
} from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { alert, type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { ColorSwatches } from '@/shared/ui/color-swatches';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { BOARD_ICON_OPTIONS, DEFAULT_BOARD_ICON } from '../model/board-icons';
import { deleteIssueBoardCascade, updateIssueBoardRecord } from '../model/boards';
import { errorMessage } from '../model/issue-errors';
import { BoardDangerZone } from './board-danger-zone';
import { BoardRulesEditor } from './board-rules-editor';
import { BoardStatusesEditor } from './board-statuses-editor';
import { LabelsManager } from './label-editor/labels-manager';

export type BoardSettingsResult = 'saved' | 'created' | 'archived' | 'removed';

export interface BoardSettingsData {
  orgId: string;
  boardId: string;
  mode: 'edit' | 'create';
}

export function openBoardSettingsDialog(orgId: string, boardId: string) {
  return dialog.open(BoardSettingsDialog, {
    title: 'Board settings',
    data: { orgId, boardId, mode: 'edit' },
    className: 'sm:max-w-lg',
  });
}

export function openBoardCreateSettingsDialog(orgId: string, boardId: string) {
  return dialog.open(BoardSettingsDialog, {
    title: 'New board',
    description: 'Name the board and set up its columns, color and automation.',
    data: { orgId, boardId, mode: 'create' },
    className: 'sm:max-w-lg',
  });
}

export function BoardSettingsDialog({
  onResolve,
  data,
}: DialogComponentProps<BoardSettingsResult, BoardSettingsData>) {
  const orgId = data?.orgId ?? '';
  const boardId = data?.boardId ?? '';
  const creating = data?.mode === 'create';
  const board = useIssueBoardStore((state) => state.boardById(boardId));
  const agents = useAgentStore(
    useShallow((state) => state.items.filter((agent) => agent.orgId === orgId)),
  );
  const labels = useIssueLabelStore((state) => state.items);

  const [name, setName] = useState(creating ? '' : (board?.name ?? ''));
  const [description, setDescription] = useState(board?.description ?? '');
  const [color, setColor] = useState<string | null>(board?.color || null);
  const [icon, setIcon] = useState(board?.icon || DEFAULT_BOARD_ICON);
  const [saving, setSaving] = useState(false);

  if (!board) {
    return null;
  }
  const canSave = name.trim().length > 0 && !saving;
  const submitLabel = creating ? 'Create board' : 'Save board';
  const busyLabel = creating ? 'Creating...' : 'Saving...';

  const save = async (): Promise<void> => {
    if (!canSave) {
      return;
    }
    const body: UpdateIssueBoardBody = {
      name: name.trim(),
      description: description.trim(),
      color: color ?? '',
      icon,
    };
    setSaving(true);
    const ok = await updateIssueBoardRecord(orgId, boardId, body);
    setSaving(false);
    if (ok) {
      onResolve?.(creating ? 'created' : 'saved');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="board-name">Name</FieldLabel>
            <Input
              id="board-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              placeholder={creating ? 'e.g. Product roadmap' : undefined}
              data-testid="board-settings-name"
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="board-description">Description</FieldLabel>
            <Textarea
              id="board-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="What is this board for?"
            />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel>Color</FieldLabel>
          <ColorSwatches
            value={color}
            onChange={setColor}
            testIdPrefix="board-settings-color"
            extraItem={
              isCustomColor(color) && color !== null
                ? { value: color, label: 'Color custom', color }
                : undefined
            }
          />
        </Field>
        <Field>
          <FieldLabel>Icon</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {BOARD_ICON_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              const selected = icon === option.name;
              return (
                <button
                  key={option.name}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted/60',
                    selected && cn('border-transparent', entityColorTintClass(color)),
                  )}
                  style={selected ? entityColorTintStyle(color) : undefined}
                  data-testid={`board-settings-icon-${option.name}`}
                  onClick={() => setIcon(option.name)}
                >
                  <OptionIcon className="size-4" />
                </button>
              );
            })}
          </div>
        </Field>
        <div className="space-y-2 border-t pt-4">
          <h4 className="flex items-center gap-2 font-medium text-sm">
            <TagIcon className="size-4 text-muted-foreground" />
            Labels
          </h4>
          <p className="text-muted-foreground text-xs">
            Shared with the whole organization: issue labels and rule conditions.
          </p>
          <LabelsManager orgId={orgId} />
        </div>
        <div className="space-y-2 border-t pt-4">
          <h4 className="flex items-center gap-2 font-medium text-sm">
            <Columns3Icon className="size-4 text-muted-foreground" />
            Statuses
          </h4>
          <p className="text-muted-foreground text-xs">
            Columns of this board. Exactly one status is the entry point for new issues. Deleting a
            status with live issues asks where to move them.
          </p>
          {board.statuses.length > 0 ? (
            <BoardStatusesEditor orgId={orgId} boardId={board.id} statuses={board.statuses} />
          ) : null}
        </div>
        <div className="space-y-2 border-t pt-4">
          <h4 className="flex items-center gap-2 font-medium text-sm">
            <WorkflowIcon className="size-4 text-muted-foreground" />
            Automation rules
          </h4>
          <BoardRulesEditor
            orgId={orgId}
            boardId={board.id}
            rules={board.rules}
            statuses={board.statuses}
            agents={agents}
            labels={labels}
          />
        </div>
        {creating ? null : (
          <BoardDangerZone orgId={orgId} board={board} onArchived={() => onResolve?.('archived')} />
        )}
      </div>
      <DialogFooter>
        {creating ? null : (
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            data-testid="board-delete"
            onClick={() => {
              void alert
                .confirm({
                  title: `Delete board "${board.name}"?`,
                  description: 'The board and all of its issues will be permanently deleted.',
                  confirmText: 'Delete board',
                  variant: 'destructive',
                })
                .then(async (confirmed) => {
                  if (!confirmed) {
                    return;
                  }
                  try {
                    await deleteIssueBoardCascade(orgId, board.id);
                    onResolve?.('removed');
                  } catch (error) {
                    toast.add({
                      title: 'Delete failed',
                      description: errorMessage(error),
                      type: 'error',
                    });
                  }
                });
            }}
          >
            Delete
          </Button>
        )}
        <Button
          variant="outline"
          data-testid="board-save-as-preset"
          onClick={() => {
            void openComposeTeamPresetDialog(
              orgId,
              composePrefillFromBoard({
                name: board.name,
                description: board.description,
                statuses: board.statuses,
                rules: board.rules,
              }),
            );
          }}
        >
          Save as preset
        </Button>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={() => void save()} data-testid="board-settings-save">
          {saving ? busyLabel : submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { useIssueLabelStore } from '@/entities/issue';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { deleteIssueLabelAction } from '../../model/issue-detail-actions';
import { LabelForm } from './label-forms';

export function LabelPicker({
  orgId,
  selected,
  onChange,
  single = false,
  allowAny = false,
  manage = false,
  initialEditing = null,
  initialCreating = false,
  onPicked,
  onSaved,
}: {
  orgId: string;
  selected: string[];
  onChange: (labels: string[]) => void;
  single?: boolean;
  allowAny?: boolean;
  manage?: boolean;
  initialEditing?: IssueLabelRecord | null;
  initialCreating?: boolean;
  onPicked?: () => void;
  onSaved?: () => void;
}) {
  const labels = useIssueLabelStore((state) => state.items);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<IssueLabelRecord | null>(initialEditing);
  const [creating, setCreating] = useState(initialCreating);

  const toggle = (labelId: string): void => {
    if (single) {
      onChange(selected.includes(labelId) ? [] : [labelId]);
      onPicked?.();
      return;
    }
    onChange(
      selected.includes(labelId)
        ? selected.filter((value) => value !== labelId)
        : [...selected, labelId],
    );
  };

  const confirmDelete = async (label: IssueLabelRecord): Promise<void> => {
    const confirmed = await alert.confirm({
      title: `Delete "${label.title}"?`,
      description: 'Removed from all issues and any automation rule that uses it.',
      confirmText: 'Delete label',
      variant: 'destructive',
      testId: 'delete-label-dialog',
    });
    if (!confirmed) {
      return;
    }
    if (await deleteIssueLabelAction(orgId, label.id)) {
      onChange(selected.filter((value) => value !== label.id));
    }
  };

  const closeForm = (): void => {
    setEditing(null);
    setCreating(false);
  };

  if (creating || editing) {
    return (
      <LabelForm
        orgId={orgId}
        label={editing ?? undefined}
        onCancel={closeForm}
        onDone={(labelId) => {
          if (editing) {
            closeForm();
            onSaved?.();
            return;
          }
          if (single) {
            onChange([labelId]);
            onPicked?.();
          } else if (!selected.includes(labelId)) {
            onChange([...selected, labelId]);
          }
          closeForm();
        }}
      />
    );
  }

  const sorted = [...labels].sort((a, b) => a.title.localeCompare(b.title));
  const filtered = sorted.filter((label) =>
    label.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const showAny = allowAny && !query.trim();

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search labels..."
        className="h-7 text-xs"
        data-testid="label-picker-search"
      />
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {showAny ? (
          <PickerRow
            title="Any label"
            checked={selected.length === 0}
            single={single}
            onToggle={() => {
              onChange([]);
              onPicked?.();
            }}
            testId="label-picker-any"
          />
        ) : null}
        {filtered.length === 0 ? (
          <p className="px-1.5 py-2 text-center text-muted-foreground text-xs italic">
            {labels.length === 0 ? 'No labels yet.' : 'No matching labels.'}
          </p>
        ) : (
          filtered.map((label) => (
            <PickerRow
              key={label.id}
              title={label.title}
              color={label.color}
              checked={selected.includes(label.id)}
              single={single}
              onToggle={() => toggle(label.id)}
              onEdit={manage ? () => setEditing(label) : undefined}
              onDelete={manage ? () => void confirmDelete(label) : undefined}
              testId={`label-picker-row-${label.id}`}
            />
          ))
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="w-full justify-start gap-1 text-xs"
        onClick={() => setCreating(true)}
        data-testid="label-picker-create"
      >
        <PlusIcon className="size-3" />
        New label
      </Button>
    </div>
  );
}

export function LabelPickerPopover({
  orgId,
  selected,
  onChange,
  single,
  allowAny,
  manage,
  initialEditing,
  initialCreating,
  trigger,
  align = 'start',
}: {
  orgId: string;
  selected: string[];
  onChange: (labels: string[]) => void;
  single?: boolean;
  allowAny?: boolean;
  manage?: boolean;
  initialEditing?: IssueLabelRecord | null;
  initialCreating?: boolean;
  trigger: { className: string; testId: string; children: React.ReactNode };
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(trigger.className, open && 'bg-muted')}
            data-testid={trigger.testId}
          />
        }
      >
        {trigger.children}
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={4} className="w-64 p-1.5">
        <LabelPicker
          orgId={orgId}
          selected={selected}
          onChange={onChange}
          single={single}
          allowAny={allowAny}
          manage={manage}
          initialEditing={initialEditing}
          initialCreating={initialCreating}
          onPicked={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function RuleLabelTriggerLabel({ label }: { label: IssueLabelRecord | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {label ? (
        <>
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
          <span className="truncate">{label.title}</span>
        </>
      ) : (
        <>
          <span className="size-2 shrink-0 rounded-full border border-muted-foreground/50 border-dashed" />
          <span className="truncate">Any label</span>
        </>
      )}
      <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
    </span>
  );
}

function PickerRow({
  title,
  color,
  checked,
  single,
  onToggle,
  onEdit,
  onDelete,
  testId,
}: {
  title: string;
  color?: string;
  checked: boolean;
  single: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  testId: string;
}) {
  return (
    <div className="group/row flex items-center rounded-md transition-colors hover:bg-accent">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 cursor-default select-none items-center gap-2 rounded-md px-1.5 py-1 text-left text-accent-foreground text-xs outline-hidden"
        data-testid={testId}
      >
        {color ? (
          <span
            className="size-2 shrink-0 rounded-full transition-shadow"
            style={{
              backgroundColor: color,
              boxShadow: !single && checked ? `0 0 0 3px ${color}40` : undefined,
            }}
          />
        ) : (
          <span className="size-2 shrink-0 rounded-full border border-muted-foreground/50 border-dashed" />
        )}
        <span className={cn('min-w-0 flex-1 truncate', checked && 'font-medium')}>{title}</span>
        {single ? <RadioMark checked={checked} color={color ?? 'var(--primary)'} /> : null}
      </button>
      {onEdit ? (
        <button
          type="button"
          aria-label={`Edit ${title}`}
          onClick={onEdit}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-accent-foreground group-hover/row:opacity-100"
        >
          <PencilIcon className="size-3" />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${title}`}
          onClick={onDelete}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
        >
          <TrashIcon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function RadioMark({ checked, color }: { checked: boolean; color: string }) {
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors"
      style={{
        borderColor: checked ? color : 'var(--color-input)',
        backgroundColor: checked ? `${color}1f` : undefined,
      }}
    >
      {checked ? (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      ) : null}
    </span>
  );
}

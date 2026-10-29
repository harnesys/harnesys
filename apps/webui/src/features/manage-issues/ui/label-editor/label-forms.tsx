import type { IssueLabelRecord } from '@harnesys/studio-shared';
import { ArrowLeftIcon, CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { DEFAULT_LABEL_COLOR, LABEL_COLORS } from '@/shared/ui/label-colors';
import { createIssueLabelAction, renameIssueLabelAction } from '../../model/issue-detail-actions';

function LabelColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Color ${hex}`}
          onClick={() => onChange(hex)}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border transition-transform hover:scale-105',
            value === hex && 'ring-2 ring-ring/60',
          )}
          style={{ backgroundColor: hex }}
        >
          {value === hex ? <CheckIcon className="size-2.5 text-white" /> : null}
        </button>
      ))}
    </div>
  );
}

export function LabelForm({
  orgId,
  label,
  initialTitle = '',
  onDone,
  onCancel,
}: {
  orgId: string;
  label?: IssueLabelRecord;
  initialTitle?: string;
  onDone: (labelId: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(label?.title ?? initialTitle);
  const [color, setColor] = useState(label?.color || DEFAULT_LABEL_COLOR);
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();
  const dirty = trimmed !== (label?.title ?? '') || color !== (label?.color ?? color);
  const canSubmit = Boolean(trimmed) && (label ? dirty : true) && !saving;
  const actionLabel = label ? 'Save changes' : 'Create Label';

  const submit = async (): Promise<void> => {
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    let id: string | null = null;
    if (label) {
      const ok = await renameIssueLabelAction(orgId, label.id, { title: trimmed, color });
      id = ok ? label.id : null;
    } else {
      id = await createIssueLabelAction(orgId, trimmed, color);
    }
    setSaving(false);
    if (id) {
      onDone(id);
    }
  };

  return (
    <div className="space-y-1 p-1">
      <div className="flex items-center gap-1.5 border-b pb-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to labels"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {label ? <XIcon className="size-3.5" /> : <ArrowLeftIcon className="size-3.5" />}
        </button>
        <span className="truncate font-semibold text-[11px] text-foreground">
          {label ? `Edit "${label.title}"` : 'Create Label'}
        </span>
      </div>
      <div className="space-y-1">
        <span className="font-medium text-[10px] text-muted-foreground">Name</span>
        <Input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Label name"
          className="h-7 text-xs"
          data-testid="label-form-name"
        />
      </div>
      <div className="space-y-1.5">
        <span className="font-medium text-[10px] text-muted-foreground">Color</span>
        <LabelColorPicker value={color} onChange={setColor} />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 w-full"
        disabled={!canSubmit}
        onClick={() => void submit()}
        data-testid="label-form-submit"
      >
        {saving ? 'Saving...' : actionLabel}
      </Button>
    </div>
  );
}

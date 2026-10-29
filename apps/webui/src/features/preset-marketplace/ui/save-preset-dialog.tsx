import type {
  AgentPresetBody,
  PresetDetail,
  PresetKind,
  TeamPresetBody,
} from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { savePreset } from '@/shared/api';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { localPresetId, presetSlug } from '../model/preset-mappers';

export interface SavePresetDialogData {
  orgId: string;
  kind: PresetKind;
  body: AgentPresetBody | TeamPresetBody;
  name: string;
  description?: string;
  tags?: string[];
  detail?: PresetDetail;
}

export function openSavePresetDialog(data: SavePresetDialogData): Promise<PresetDetail | null> {
  return dialog.open(SavePresetDialog, {
    title: data.detail ? 'Edit preset' : 'Save as preset',
    className: 'sm:max-w-lg',
    testId: 'save-preset-dialog',
    data,
  });
}

function SavePresetDialog({
  onResolve,
  data,
}: DialogComponentProps<PresetDetail | null, SavePresetDialogData>) {
  const queryClient = useQueryClient();
  const kind = data?.kind ?? 'agent';
  const body = data?.body;
  const [name, setName] = useState(data?.name ?? '');
  const [slug, setSlug] = useState(
    data?.detail
      ? (data.detail.id.split('/')[1] ?? presetSlug(data.name))
      : presetSlug(data?.name ?? ''),
  );
  const [description, setDescription] = useState(data?.description ?? '');
  const [tags, setTags] = useState((data?.tags ?? []).join(', '));
  const [instructions, setInstructions] = useState(
    kind === 'agent' && body && 'instructions' in body ? body.instructions : '',
  );
  const [saving, setSaving] = useState(false);

  if (!data || !body) {
    return null;
  }

  const canSave = name.trim().length > 0 && slug.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      const id = data.detail?.id ?? localPresetId(slug);
      const tagList = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const meta = {
        id,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(tagList.length > 0 ? { tags: tagList } : {}),
      };
      const payload =
        kind === 'agent'
          ? {
              kind,
              ...meta,
              body: { ...(body as AgentPresetBody), name: name.trim(), instructions },
            }
          : { kind, ...meta, body: body as TeamPresetBody };
      const saved = await savePreset(payload);
      await queryClient.invalidateQueries({ queryKey: ['presets'] });
      toast.add({ title: 'Preset saved' });
      onResolve?.(saved);
    } catch (error) {
      toast.add({ title: error instanceof Error ? error.message : 'Could not save preset' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="preset-name">Name</FieldLabel>
            <Input
              id="preset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="preset-slug">
              Slug <span className="text-muted-foreground/60">(part after local/)</span>
            </FieldLabel>
            <Input
              id="preset-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={Boolean(data.detail)}
              className="font-mono"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="preset-description">Description</FieldLabel>
            <Input
              id="preset-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="preset-tags">
              Tags <span className="text-muted-foreground/60">(comma separated)</span>
            </FieldLabel>
            <Input
              id="preset-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {data.detail ? (
          <p className="text-muted-foreground text-xs">
            Current version v{data.detail.version}. Saving bumps it automatically.
          </p>
        ) : null}
        {kind === 'agent' ? (
          <Field>
            <FieldLabel htmlFor="preset-instructions">Instructions</FieldLabel>
            <Textarea
              id="preset-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </Field>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          data-testid="save-preset-submit"
          onClick={() => {
            void submit();
          }}
        >
          {saving ? 'Saving…' : 'Save preset'}
        </Button>
      </DialogFooter>
    </div>
  );
}

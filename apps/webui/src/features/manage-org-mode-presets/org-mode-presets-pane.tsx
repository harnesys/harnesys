import type { ModePresetPublic, UpdateModePresetBody } from '@harnesys/contracts';
import type { ModePreset } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDotIcon, CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import type { ModePresetDraft } from '@/features/manage-project-settings/ui/mode-preset-draft';
import { ModePresetEditor } from '@/features/manage-project-settings/ui/mode-preset-editor';
import {
  createOrgModePreset,
  deleteOrgModePreset,
  orgModePresetsQuery,
  orgModePresetsQueryKey,
  updateOrgModePreset,
} from '@/shared/api/org-mode-presets';
import { orgSkillsQuery } from '@/shared/api/org-skills';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

function contentPatch(draft: ModePresetDraft): UpdateModePresetBody {
  return {
    name: draft.name,
    description: draft.description ?? '',
    instructions: draft.instructions ?? '',
    skills: draft.skills ?? [],
    packs: draft.packs ?? {},
    permissions: draft.permissions,
    installedByDefault: draft.installedByDefault,
  };
}

function toStudioPreset(preset: ModePresetPublic): ModePreset {
  return {
    orgId: preset.orgId,
    id: preset.id,
    name: preset.name,
    ...(preset.description !== undefined ? { description: preset.description } : {}),
    ...(preset.instructions !== undefined ? { instructions: preset.instructions } : {}),
    ...(preset.skills !== undefined ? { skills: preset.skills } : {}),
    ...(preset.packs !== undefined ? { packs: preset.packs } : {}),
    ...(preset.permissions !== undefined ? { permissions: preset.permissions } : {}),
    builtin: preset.builtin,
    installedByDefault: preset.installedByDefault,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

type PresetEditing =
  | { kind: 'edit'; preset: ModePresetPublic }
  | { kind: 'draft'; preset: ModePresetPublic | null };

export function OrgModePresetsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const presetsQuery = useQuery(orgModePresetsQuery(orgId));
  const presets = presetsQuery.data?.items ?? [];
  const [editing, setEditing] = useState<PresetEditing | null>(null);
  const skillsQuery = useQuery(orgSkillsQuery(orgId));
  const skillNames = (skillsQuery.data?.skills ?? []).map((skill) => skill.name);

  async function refreshCache() {
    await queryClient.invalidateQueries({ queryKey: orgModePresetsQueryKey(orgId) });
  }

  const create = useMutation({
    mutationFn: (draft: ModePresetDraft) => createOrgModePreset(orgId, { ...draft }),
    onSuccess: async (created) => {
      await refreshCache();
      toast.add({ title: 'Mode preset created', description: created.id });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not create preset',
      });
    },
  });

  const update = useMutation({
    mutationFn: (input: { preset: ModePresetPublic; draft: ModePresetDraft }) =>
      updateOrgModePreset(
        orgId,
        input.preset.id,
        input.preset.builtin
          ? { installedByDefault: input.draft.installedByDefault }
          : contentPatch(input.draft),
      ),
    onSuccess: async (updated) => {
      await refreshCache();
      toast.add({ title: 'Mode preset saved', description: updated.id });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not save preset',
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteOrgModePreset(orgId, id),
    onSuccess: async () => {
      await refreshCache();
      toast.add({ title: 'Mode preset deleted' });
    },
    onError: (error) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not delete preset',
      });
    },
  });

  function confirmRemove(preset: ModePresetPublic) {
    void alert
      .confirm({
        title: `Delete ${preset.name}?`,
        description: 'Agents keep their installed copies.',
        confirmText: 'Delete',
        variant: 'destructive',
      })
      .then((confirmed) => {
        if (confirmed) {
          remove.mutate(preset.id);
        }
      });
  }

  function toggleEdit(preset: ModePresetPublic) {
    setEditing((current) =>
      current?.kind === 'edit' && current.preset.id === preset.id ? null : { kind: 'edit', preset },
    );
  }

  const draft = editing?.kind === 'draft' ? editing : null;

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-mode-presets-pane">
      <RowHeader label="Presets" count={presetsQuery.isPending ? undefined : presets.length}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={create.isPending}
          onClick={() => setEditing({ kind: 'draft', preset: null })}
          data-testid="mode-presets-create"
        >
          <PlusIcon />
          New preset
        </Button>
      </RowHeader>

      {presetsQuery.isPending && <RowListSkeleton testId="presets-loading" />}
      {!presetsQuery.isPending &&
        (presets.length === 0 && !draft ? (
          <SettingsEmpty
            title="No mode presets"
            description="Presets install as agent modes; built-in ones seed the catalog."
          />
        ) : (
          <RowList>
            {presets.map((preset) => {
              const expanded = editing?.kind === 'edit' && editing.preset.id === preset.id;
              const packCount = Object.keys(preset.packs ?? {}).length;
              const counts = [
                (preset.skills?.length ?? 0) > 0 ? `${preset.skills?.length} skills` : null,
                packCount > 0 ? `${packCount} packs` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Row
                  key={preset.id}
                  testId={`mode-preset-${preset.id}`}
                  title={preset.name}
                  icon={<CircleDotIcon />}
                  mono={false}
                  meta={preset.builtin ? 'built-in' : undefined}
                  chips={
                    preset.installedByDefault ? <RowChip tone="accent">default</RowChip> : null
                  }
                  summary={
                    expanded
                      ? undefined
                      : [preset.description || preset.id, counts].filter(Boolean).join(' · ')
                  }
                  onToggle={() => toggleEdit(preset)}
                  expanded={expanded}
                  actions={
                    expanded ? undefined : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Duplicate ${preset.name}`}
                          onClick={() =>
                            setEditing({
                              kind: 'draft',
                              preset: {
                                ...preset,
                                id: `${preset.id}-copy`,
                                builtin: false,
                              },
                            })
                          }
                          data-testid={`mode-preset-duplicate-${preset.id}`}
                        >
                          <CopyIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Delete ${preset.name}`}
                          disabled={preset.builtin}
                          onClick={() => confirmRemove(preset)}
                          data-testid={`mode-preset-remove-${preset.id}`}
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    )
                  }
                >
                  {expanded ? (
                    <ModePresetEditor
                      preset={toStudioPreset(preset)}
                      skillNames={skillNames}
                      packNames={[]}
                      busy={update.isPending}
                      onSave={(formDraft) =>
                        update.mutate(
                          { preset, draft: formDraft },
                          { onSuccess: () => setEditing(null) },
                        )
                      }
                      onCancel={() => setEditing(null)}
                    />
                  ) : null}
                </Row>
              );
            })}
            {draft ? (
              <Row
                testId="mode-preset-new"
                title={draft.preset ? `Copy of ${draft.preset.name}` : 'New preset'}
                icon={<CircleDotIcon />}
                mono={false}
                meta="preset"
                summary={draft.preset?.description}
                onToggle={() => setEditing(null)}
                expanded
              >
                <ModePresetEditor
                  preset={draft.preset ? toStudioPreset(draft.preset) : null}
                  skillNames={skillNames}
                  packNames={[]}
                  busy={create.isPending}
                  onSave={(formDraft) =>
                    create.mutate(formDraft, { onSuccess: () => setEditing(null) })
                  }
                  onCancel={() => setEditing(null)}
                />
              </Row>
            ) : null}
          </RowList>
        ))}
    </div>
  );
}

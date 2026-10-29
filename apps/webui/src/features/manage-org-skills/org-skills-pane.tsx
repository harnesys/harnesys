import type { CreateOrgSkillBody, OrgSkill } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PackageOpenIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
} from 'lucide-react';
import { useState } from 'react';
import { openCreateSkillDialog } from '@/features/manage-project-skills';
import {
  createOrgSkill,
  deleteOrgSkill,
  orgSettingsQuery,
  orgSettingsQueryKey,
  orgSkillsQuery,
  orgSkillsQueryKey,
  patchOrgSettings,
  reloadOrgSkills,
  restoreSystemSkill,
  updateInstalledSkill,
  useSkillsChangedWatch,
} from '@/shared/api/org-skills';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty } from '@/shared/ui/settings-kit';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { openInstallSkillDialog } from './ui/install-skill-dialog';
import { SkillRow } from './ui/skill-row';

const rowId = (skill: OrgSkill): string => {
  switch (skill.origin.kind) {
    case 'source':
      return `source:${skill.origin.sourceId}:${skill.origin.relativePath}`;
    case 'plugin':
      return `plugin:${skill.origin.pluginName}:${skill.name}`;
    default:
      return `${skill.origin.kind}:${skill.name}`;
  }
};

export function OrgSkillsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery(orgSkillsQuery(orgId));
  const settingsQuery = useQuery(orgSettingsQuery(orgId));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useSkillsChangedWatch(orgId, () => {
    void queryClient.invalidateQueries({ queryKey: orgSkillsQueryKey(orgId) });
  });

  const skills = skillsQuery.data?.skills ?? [];
  const orgSkills = skills.filter((s) => s.origin.kind === 'org');
  const sourceSkills = skills.filter((s) => s.origin.kind === 'source');
  const systemSkills = skills.filter((s) => s.origin.kind === 'system');
  const hostSkills = skills.filter((s) => s.origin.kind === 'host');
  const pluginSkills = skills.filter((s) => s.origin.kind === 'plugin');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: orgSkillsQueryKey(orgId) });

  const reload = useMutation({
    mutationFn: () => reloadOrgSkills(orgId),
    onSuccess: (result) => {
      queryClient.setQueryData(orgSkillsQueryKey(orgId), result);
      toast.add({ title: 'Skills reloaded' });
    },
    onError: (error) =>
      toast.add({ title: error instanceof Error ? error.message : 'Reload failed' }),
  });

  const remove = useMutation({
    mutationFn: (name: string) => deleteOrgSkill(orgId, name),
    onSuccess: async (_result, name) => {
      await invalidate();
      toast.add({ title: 'Skill deleted', description: name });
    },
    onError: (error) =>
      toast.add({ title: error instanceof Error ? error.message : 'Delete failed' }),
  });

  const update = useMutation({
    mutationFn: (name: string) => updateInstalledSkill(orgId, name),
    onSuccess: async (_result, name) => {
      await invalidate();
      toast.add({ title: 'Skill updated', description: name });
    },
    onError: (error) =>
      toast.add({ title: error instanceof Error ? error.message : 'Update failed' }),
  });

  const restore = useMutation({
    mutationFn: (name: string) => restoreSystemSkill(name),
    onSuccess: async (_result, name) => {
      await invalidate();
      toast.add({ title: 'System skill reset to bundled', description: name });
    },
    onError: (error) =>
      toast.add({ title: error instanceof Error ? error.message : 'Reset failed' }),
  });

  const saveSettings = useMutation({
    mutationFn: (skillsSourceAutoLoad: boolean) =>
      patchOrgSettings(orgId, { skillsSourceAutoLoad }),
    onSuccess: (result) => {
      queryClient.setQueryData(orgSettingsQueryKey(orgId), result);
      void invalidate();
    },
    onError: (error) =>
      toast.add({ title: error instanceof Error ? error.message : 'Could not save setting' }),
  });

  const create = useMutation({
    mutationFn: (body: CreateOrgSkillBody) => createOrgSkill(orgId, body),
    onSuccess: async (result) => {
      await invalidate();
      toast.add({ title: 'Skill created', description: result.skill.name });
    },
    onError: (error) =>
      toast.add({ title: error instanceof Error ? error.message : 'Create failed' }),
  });

  const deleteSkill = (name: string) => {
    void alert
      .confirm({
        title: `Delete skill "${name}"?`,
        description: 'The skill directory is removed from this organization.',
        confirmText: 'Delete',
        variant: 'destructive',
        testId: 'delete-skill-confirm',
      })
      .then((ok) => {
        if (ok) {
          remove.mutate(name);
        }
      });
  };

  const resetSystemSkill = (name: string) => {
    void alert
      .confirm({
        title: `Reset "${name}" to the bundled version?`,
        description:
          'Any local edits to this system skill will be lost. The bundled copy from the app is restored.',
        confirmText: 'Reset to bundled',
        variant: 'destructive',
        testId: 'reset-system-skill-confirm',
      })
      .then((ok) => {
        if (ok) {
          restore.mutate(name);
        }
      });
  };

  const toggleExpand = (id: string) => setExpandedId((current) => (current === id ? null : id));

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-skills-pane">
      <RowHeader
        label="Skills"
        count={skillsQuery.isPending ? undefined : skills.length}
        description="System, host, organization, plugin and source skills, in load priority."
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId || reload.isPending}
          onClick={() => reload.mutate()}
        >
          <RefreshCwIcon />
          Reload
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId}
          onClick={() => {
            void openInstallSkillDialog(orgId).then((installed) => {
              if (installed) {
                void invalidate();
              }
            });
          }}
        >
          <PackageOpenIcon />
          Install from repo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId}
          onClick={() => {
            void openCreateSkillDialog().then((draft) => {
              if (draft) {
                create.mutate(draft);
              }
            });
          }}
        >
          <PlusIcon />
          New skill
        </Button>
      </RowHeader>

      {skillsQuery.isPending ? <RowListSkeleton rows={4} testId="skills-loading" /> : null}

      {!skillsQuery.isPending && skills.length === 0 ? (
        <SettingsEmpty
          title="No skills yet"
          description="Install from a repository or drop SKILL.md into the org skills directory."
        />
      ) : null}

      {orgSkills.length > 0 ? (
        <section className="flex flex-col gap-1">
          <RowHeader label="Organization" count={orgSkills.length} />
          <RowList>
            {orgSkills.map((skill) => (
              <SkillRow
                key={rowId(skill)}
                skill={skill}
                expanded={expandedId === rowId(skill)}
                onToggle={() => toggleExpand(rowId(skill))}
                actions={
                  <>
                    {skill.canUpdate ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        disabled={update.isPending}
                        onClick={() => update.mutate(skill.name)}
                      >
                        <UploadIcon />
                        Update
                      </Button>
                    ) : null}
                    {skill.canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={remove.isPending}
                        onClick={() => deleteSkill(skill.name)}
                      >
                        <Trash2Icon />
                        Delete
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))}
          </RowList>
        </section>
      ) : null}

      <section className="flex flex-col gap-1">
        <RowHeader
          label="Sources"
          count={sourceSkills.length}
          description="Skills discovered in connected repositories."
        >
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span id="skills-auto-load-label">Auto-load</span>
            <Switch
              size="sm"
              aria-labelledby="skills-auto-load-label"
              checked={settingsQuery.data ? settingsQuery.data.skillsSourceAutoLoad : false}
              disabled={!orgId || settingsQuery.isPending || saveSettings.isPending}
              onCheckedChange={(value) => saveSettings.mutate(value === true)}
            />
          </div>
        </RowHeader>
        {settingsQuery.data && !settingsQuery.data.skillsSourceAutoLoad ? (
          <p className="text-muted-foreground text-xs leading-4">
            Auto-load is off: source skills are listed but not loadable until enabled.
          </p>
        ) : null}
        {sourceSkills.length > 0 ? (
          <RowList>
            {sourceSkills.map((skill) => (
              <SkillRow
                key={rowId(skill)}
                skill={skill}
                expanded={expandedId === rowId(skill)}
                onToggle={() => toggleExpand(rowId(skill))}
              />
            ))}
          </RowList>
        ) : null}
      </section>

      {systemSkills.length > 0 ? (
        <section className="flex flex-col gap-1">
          <RowHeader
            label="System"
            count={systemSkills.length}
            description="Bundled with the app, seeded on first start."
          />
          <RowList>
            {systemSkills.map((skill) => (
              <SkillRow
                key={rowId(skill)}
                skill={skill}
                expanded={expandedId === rowId(skill)}
                onToggle={() => toggleExpand(rowId(skill))}
                actions={
                  skill.updateAvailable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={restore.isPending}
                      onClick={() => resetSystemSkill(skill.name)}
                    >
                      <Undo2Icon />
                      Reset to bundled
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </RowList>
        </section>
      ) : null}

      {hostSkills.length > 0 ? (
        <section className="flex flex-col gap-1">
          <RowHeader
            label="Host"
            count={hostSkills.length}
            description="From ~/.agents/skills on this machine, read-only."
          />
          <RowList>
            {hostSkills.map((skill) => (
              <SkillRow
                key={rowId(skill)}
                skill={skill}
                expanded={expandedId === rowId(skill)}
                onToggle={() => toggleExpand(rowId(skill))}
              />
            ))}
          </RowList>
        </section>
      ) : null}

      {pluginSkills.length > 0 ? (
        <section className="flex flex-col gap-1">
          <RowHeader
            label="Plugins"
            count={pluginSkills.length}
            description="Provided by installed plugins."
          />
          <RowList>
            {pluginSkills.map((skill) => (
              <SkillRow
                key={rowId(skill)}
                skill={skill}
                expanded={expandedId === rowId(skill)}
                onToggle={() => toggleExpand(rowId(skill))}
              />
            ))}
          </RowList>
        </section>
      ) : null}
    </div>
  );
}

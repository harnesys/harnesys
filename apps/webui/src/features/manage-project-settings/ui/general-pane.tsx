import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useActiveOrgStore } from '@/entities/org-machine';
import { type Project, useDeleteProject, useProjects, useUpdateProject } from '@/entities/project';
import { afterProjectRemoved } from '@/features/ide';
import { getActiveOrgId } from '@/shared/api/active-org';
import { putSourceLsp, sourceLspQuery, sourceLspQueryKey } from '@/shared/api/org-lsp';
import { projectQueryKey } from '@/shared/api/projects';
import { setSourceVisibility } from '@/shared/api/sources';
import { useOrgId } from '@/shared/config/location';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  DangerZone,
  SettingsEmpty,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { SourceHostStatusMatrix } from './source-host-status-matrix';
import { SourceWorktreesPanel } from './source-worktrees-panel';

export function GeneralPane({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const projectQuery = useProjects();
  const project = (projectQuery.data ?? []).find((item) => item.id === projectId) ?? null;
  const orgId = useOrgId() ?? getActiveOrgId() ?? '';
  if (!project) {
    return (
      <SettingsEmpty
        title="Source is not available on this surface"
        description="It may live on another machine in this organization."
        testId="source-general-missing"
      />
    );
  }
  const distributionKind = project.driver ?? 'host-bound';
  return (
    <div className="flex w-full flex-col gap-6" data-testid="source-general-pane">
      <GeneralSection
        key={`${project.id}:${project.name}:${project.uiVisibility ?? 'org'}`}
        project={project}
      />
      {orgId ? (
        <SourceHostStatusMatrix
          orgId={orgId}
          sourceId={project.id}
          distributionKind={distributionKind}
          hasRemote={project.gitRemote != null}
          originHostId={project.hostId ?? null}
        />
      ) : null}
      {orgId && project.hasGit ? (
        <SourceWorktreesPanel orgId={orgId} sourceId={project.id} />
      ) : null}
      <SourceLspSection projectId={project.id} />
      <LifecycleSection project={project} onClose={onClose} />
    </div>
  );
}

function SourceLspSection({ projectId }: { projectId: string }) {
  const orgId = useOrgId() ?? getActiveOrgId() ?? '';
  const queryClient = useQueryClient();
  const lspQuery = useQuery(sourceLspQuery(orgId, projectId));
  const [raw, setRaw] = useState('{}');

  useEffect(() => {
    if (lspQuery.data) {
      setRaw(JSON.stringify(lspQuery.data.raw ?? {}, null, 2));
    }
  }, [lspQuery.data]);

  const savedRaw = lspQuery.data ? JSON.stringify(lspQuery.data.raw ?? {}, null, 2) : '';

  const save = useMutation({
    mutationFn: () => {
      const parsed: unknown = JSON.parse(raw);
      return putSourceLsp(orgId, projectId, parsed);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(sourceLspQueryKey(orgId, projectId), result);
      setRaw(JSON.stringify(result.raw ?? {}, null, 2));
      toast.add({ title: 'Source LSP override saved' });
    },
    onError: (error) => {
      toast.add({
        title: 'LSP save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  if (!orgId) {
    return null;
  }

  return (
    <SettingsSection
      label="LSP override"
      description="Optional per-source lsp_json override stored in org.db (not a sidecar file)."
      actions={
        <SettingsSave
          dirty={raw !== savedRaw}
          pending={save.isPending}
          onSave={() => save.mutate()}
          onDiscard={() => setRaw(savedRaw)}
          testId="source-lsp-save"
        />
      }
      testId="source-lsp-section"
    >
      <Textarea
        aria-label="Source LSP override JSON"
        className="min-h-28 font-mono text-xs"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        disabled={lspQuery.isPending}
      />
    </SettingsSection>
  );
}

function GeneralSection({ project }: { project: Project }) {
  const [name, setName] = useState(project.name);
  const [visibility, setVisibility] = useState<'org' | 'host'>(project.uiVisibility ?? 'org');
  const update = useUpdateProject();
  const queryClient = useQueryClient();
  const visibilityMutation = useMutation({
    mutationFn: (next: 'org' | 'host') => {
      const orgId = getActiveOrgId();
      if (!orgId) {
        return Promise.reject(new Error('No active org'));
      }
      return setSourceVisibility(orgId, project.id, next);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      toast.add({ title: 'Visibility updated' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not update visibility',
      });
    },
  });
  const nameDirty = name.trim() !== project.name;
  const nameInvalid = name.trim().length === 0;
  const saveName = () => {
    void update
      .mutateAsync({
        id: project.id,
        name: name.trim(),
      })
      .then((next) => {
        setName(next.name);
        toast.add({ title: 'Source renamed' });
      })
      .catch((error: unknown) => {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not rename source',
        });
      });
  };
  const distributionLabel = project.driver === 'cloud-drive' ? 'Google Drive' : 'On this computer';
  return (
    <SettingsSection
      label="Source"
      description="Identity and visibility for this source on this machine."
      actions={
        <SettingsSave
          dirty={nameDirty}
          pending={update.isPending}
          invalid={nameInvalid}
          onSave={saveName}
          onDiscard={() => setName(project.name)}
          testId="source-general-save"
        />
      }
      testId="source-general"
    >
      <SettingsField label="Name" htmlFor="source-settings-name">
        <Input
          id="source-settings-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameInvalid || undefined}
        />
      </SettingsField>
      <SettingsField
        label="Origin"
        htmlFor="source-settings-path"
        description="Distribution identity (URL / cloud folder / bound host). Host paths stay local."
      >
        <Input id="source-settings-path" value={project.path} readOnly className="font-mono" />
      </SettingsField>
      <SettingsField label="Distribution" htmlFor="source-settings-driver">
        <Input id="source-settings-driver" value={distributionLabel} readOnly />
      </SettingsField>
      {project.hostId ? (
        <SettingsField label="Host" htmlFor="source-settings-host">
          <Input id="source-settings-host" value={project.hostId} readOnly className="font-mono" />
        </SettingsField>
      ) : null}
      <SettingsField
        label="Visibility"
        htmlFor="source-settings-visibility"
        description="Host-only hides this source from other machines in the org."
      >
        <Select
          items={[
            { value: 'org', label: 'Entire org' },
            { value: 'host', label: 'This host only' },
          ]}
          value={visibility}
          onValueChange={(next) => {
            if (next !== 'org' && next !== 'host') {
              return;
            }
            setVisibility(next);
            visibilityMutation.mutate(next);
          }}
        >
          <SelectTrigger id="source-settings-visibility" size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="w-full" align="start">
            <SelectItem value="org">Entire org</SelectItem>
            <SelectItem value="host">This host only</SelectItem>
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField label="Id" htmlFor="source-settings-id">
        <Input id="source-settings-id" value={project.id} readOnly className="font-mono" />
      </SettingsField>
    </SettingsSection>
  );
}

function LifecycleSection({ project, onClose }: { project: Project; onClose: () => void }) {
  const navigate = useNavigate();
  const urlOrgId = useOrgId();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const orgId = urlOrgId ?? storeOrgId ?? '';
  const removeSource = useDeleteProject();
  const afterRemove = () => {
    afterProjectRemoved(
      (to) => {
        void navigate(to);
      },
      orgId,
      project.id,
    );
    onClose();
  };
  const detach = () => {
    void alert
      .confirm({
        title: `Detach ${project.name}?`,
        description:
          project.hasGit || project.driver === 'cloud-drive'
            ? 'Removes this source from the org and deletes its managed materialization cache. Your original remote / cloud data stays.'
            : 'Removes this source from the org. The folder on disk stays.',
        confirmText: 'Detach',
        variant: 'destructive',
        testId: 'detach-source-dialog',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        void removeSource
          .mutateAsync(project.id)
          .then(afterRemove)
          .catch((error: unknown) => {
            toast.add({
              title: error instanceof Error ? error.message : 'Could not detach source',
            });
          });
      });
  };
  if (project.managed) {
    return (
      <SettingsSection label="Lifecycle" testId="source-lifecycle">
        <p className="px-1 text-muted-foreground text-sm">
          Managed Workspace cannot be detached. It belongs to the org.
        </p>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection label="Danger" testId="source-lifecycle">
      <DangerZone
        title="Detach source"
        description="Unregisters from this org. Disk content outside managed cache stays."
      >
        <Button
          variant="destructive"
          size="sm"
          disabled={removeSource.isPending}
          onClick={detach}
          data-testid="source-detach"
        >
          Detach
        </Button>
      </DangerZone>
    </SettingsSection>
  );
}

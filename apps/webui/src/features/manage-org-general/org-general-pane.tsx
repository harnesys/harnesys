import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useOrgStore } from '@/features/switch-org/org-context';
import { removeNode, selfNodeCached } from '@/shared/api/fleet';
import {
  activateOrg,
  deleteOrg,
  listOrgs,
  type MachineOrgEntry,
  updateOrg,
} from '@/shared/api/orgs';
import { studioPath } from '@/shared/config/routes';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  DangerZone,
  SettingsEmpty,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { OrgTimezoneSection } from './ui/org-timezone-section';

const DESCRIPTION_MAX = 500;

export function OrgGeneralPane({ orgId }: { orgId: string }) {
  const { orgs } = useOrgStore();
  const entry = orgs.find((row) => row.orgId === orgId) ?? null;
  if (!entry) {
    return (
      <SettingsEmpty
        title="Organization is not available on this machine"
        description="Join it from the fleet page or switch to another organization."
        testId="org-general-missing"
      />
    );
  }
  return <OrgGeneralForm entry={entry} />;
}

function OrgGeneralForm({ entry }: { entry: MachineOrgEntry }) {
  const navigate = useNavigate();
  const { setOrgs, setActiveOrgId, upsertOrg } = useOrgStore();
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const nameTrimmed = name.trim();
  const descriptionTrimmed = description.trim();
  const nameDirty = nameTrimmed !== entry.name;
  const descriptionDirty = descriptionTrimmed !== (entry.description ?? '');
  const dirty = nameDirty || descriptionDirty;
  const nameInvalid = nameTrimmed.length === 0;
  const descriptionInvalid = descriptionTrimmed.length > DESCRIPTION_MAX;
  const isRelay = entry.role === 'relay';
  const isWorker = entry.role === 'worker';

  const discard = () => {
    setName(entry.name);
    setDescription(entry.description ?? '');
    setError(null);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: { name?: string; description?: string } = {};
      if (nameDirty) {
        body.name = nameTrimmed;
      }
      if (descriptionDirty) {
        body.description = descriptionTrimmed;
      }
      return updateOrg(entry.orgId, body);
    },
    onSuccess: (next) => {
      upsertOrg(next);
      setName(next.name);
      setDescription(next.description ?? '');
      setError(null);
      toast.add({ title: 'Organization saved' });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not save organization');
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const selfNodeId = selfNodeCached();
      if (!selfNodeId) {
        throw new Error('This machine has no host id yet');
      }
      await removeNode(entry.orgId, selfNodeId);
      try {
        await deleteOrg(entry.orgId);
      } catch {
        // NODE_REMOVED may already have cleared the local entry
      }
      await refreshAfterExit({ setOrgs, setActiveOrgId, navigate });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not leave organization');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteOrg(entry.orgId);
      await refreshAfterExit({ setOrgs, setActiveOrgId, navigate });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not delete organization');
    },
  });

  const dangerBusy = leaveMutation.isPending || deleteMutation.isPending;
  const canDelete = confirmName === entry.name && !dangerBusy;

  const onLeave = () => {
    void alert
      .confirm({
        title: `Leave “${entry.name}”?`,
        description:
          'This machine leaves the organization. Agents and sources stay on the relay for other hosts.',
        confirmText: 'Leave',
        variant: 'destructive',
        testId: 'org-leave-dialog',
      })
      .then((ok) => {
        if (ok) {
          setError(null);
          leaveMutation.mutate();
        }
      });
  };

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-general-pane">
      <SettingsSection
        label="Profile"
        description="Name and description for this organization on this machine."
        actions={
          <SettingsSave
            dirty={dirty}
            pending={saveMutation.isPending}
            invalid={nameInvalid || descriptionInvalid}
            onSave={() => {
              setError(null);
              saveMutation.mutate();
            }}
            onDiscard={discard}
            testId="org-general-save"
          />
        }
        testId="org-general-profile"
      >
        <SettingsField
          label="Name"
          htmlFor="org-general-name"
          error={nameInvalid ? 'Name cannot be empty' : null}
        >
          <Input
            id="org-general-name"
            value={name}
            autoComplete="off"
            aria-invalid={nameInvalid || undefined}
            data-testid="org-general-name"
            onChange={(event) => setName(event.target.value)}
          />
        </SettingsField>
        <SettingsField
          label="Description"
          htmlFor="org-general-description"
          description={`Optional. ${descriptionTrimmed.length}/${DESCRIPTION_MAX}`}
        >
          <Textarea
            id="org-general-description"
            value={description}
            className="min-h-24"
            maxLength={DESCRIPTION_MAX}
            data-testid="org-general-description"
            onChange={(event) => setDescription(event.target.value)}
          />
        </SettingsField>
        {error ? (
          <p className="px-1 text-destructive text-sm" data-testid="org-general-error">
            {error}
          </p>
        ) : null}
      </SettingsSection>

      <OrgTimezoneSection orgId={entry.orgId} />

      {isWorker ? (
        <SettingsSection label="Danger" testId="org-general-danger">
          <DangerZone
            title="Leave organization"
            description="Remove this machine from the fleet. The organization continues on the relay."
          >
            <Button
              variant="destructive"
              size="sm"
              disabled={dangerBusy}
              data-testid="org-general-leave"
              onClick={onLeave}
            >
              {leaveMutation.isPending ? 'Leaving...' : 'Leave'}
            </Button>
          </DangerZone>
        </SettingsSection>
      ) : null}

      {isRelay ? (
        <SettingsSection label="Danger" testId="org-general-danger">
          <DangerZone
            layout="stack"
            title="Delete organization"
            description="Permanently delete this organization on this machine and notify online workers."
          >
            <Input
              value={confirmName}
              autoComplete="off"
              placeholder={entry.name}
              aria-label="Type the organization name to confirm"
              data-testid="org-general-confirm-name"
              onChange={(event) => setConfirmName(event.target.value)}
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={!canDelete}
              data-testid="org-general-delete"
              onClick={() => {
                if (!canDelete) {
                  return;
                }
                setError(null);
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete organization'}
            </Button>
          </DangerZone>
        </SettingsSection>
      ) : null}
    </div>
  );
}

async function refreshAfterExit(input: {
  setOrgs: (orgs: MachineOrgEntry[]) => void;
  setActiveOrgId: (orgId: string | null) => void;
  navigate: ReturnType<typeof useNavigate>;
}): Promise<void> {
  const response = await listOrgs();
  input.setOrgs(response.orgs);
  if (response.orgs.length === 0) {
    input.setActiveOrgId(null);
    void input.navigate('/', { replace: true });
    return;
  }
  const next =
    response.activeOrgId && response.orgs.some((row) => row.orgId === response.activeOrgId)
      ? response.activeOrgId
      : (response.orgs[0]?.orgId ?? null);
  if (!next) {
    input.setActiveOrgId(null);
    void input.navigate('/', { replace: true });
    return;
  }
  input.setActiveOrgId(next);
  void activateOrg(next).catch(() => undefined);
  void input.navigate(studioPath.desk(next), { replace: true });
}

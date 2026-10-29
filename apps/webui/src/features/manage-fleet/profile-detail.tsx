import type { ExecutionProfileIsolation, ExecutionProfileListItem } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  deleteExecutionProfile,
  executionProfilesQueryKey,
  fleetNodesQuery,
  setDefaultExecutionProfile,
  setExecutionProfileNodes,
  updateExecutionProfile,
} from '@/shared/api';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  DangerZone,
  SettingsEmpty,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { hostStatusLabel, resolveHostStatus } from './fleet-host-status';
import { PlacementQueueSection } from './placement-queue-section';

export function ProfileDetail({
  orgId,
  profile,
  onDeleted,
}: {
  orgId: string;
  profile: ExecutionProfileListItem;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: nodes = [] } = useQuery(fleetNodesQuery);
  const [name, setName] = useState(profile.name);
  const [isolation, setIsolation] = useState<ExecutionProfileIsolation>(profile.isolation);
  const [dockerImage, setDockerImage] = useState(profile.dockerImage ?? '');
  const [nodeIds, setNodeIds] = useState<Set<string>>(new Set(profile.nodeIds));
  const [busy, setBusy] = useState(false);

  const detailsDirty =
    name.trim() !== profile.name ||
    isolation !== profile.isolation ||
    (isolation === 'container' ? dockerImage.trim() !== (profile.dockerImage ?? '') : false);
  const nodesDirty =
    nodeIds.size !== profile.nodeIds.length || profile.nodeIds.some((id) => !nodeIds.has(id));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: executionProfilesQueryKey(orgId) });
  };

  const onSaveDetails = async () => {
    setBusy(true);
    try {
      await updateExecutionProfile(orgId, profile.id, {
        name: name.trim(),
        isolation,
        dockerImage: isolation === 'container' ? dockerImage.trim() || undefined : null,
      });
      await refresh();
      toast.add({ title: 'Profile saved', description: name.trim() });
    } catch (err) {
      toast.add({
        title: err instanceof Error ? err.message : 'Could not save profile',
      });
    } finally {
      setBusy(false);
    }
  };

  const onSaveNodes = async () => {
    setBusy(true);
    try {
      await setExecutionProfileNodes(orgId, profile.id, [...nodeIds]);
      await refresh();
      toast.add({ title: 'Host assignment saved' });
    } catch (err) {
      toast.add({
        title: err instanceof Error ? err.message : 'Could not save host assignment',
      });
    } finally {
      setBusy(false);
    }
  };

  const onSetDefault = async () => {
    setBusy(true);
    try {
      await setDefaultExecutionProfile(orgId, profile.id);
      await refresh();
      toast.add({ title: 'Default profile updated' });
    } catch (err) {
      toast.add({ title: err instanceof Error ? err.message : 'Could not set default' });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    void alert
      .confirm({
        title: `Delete ${profile.name}?`,
        description: 'Runs that target this profile will fall back to the default.',
        confirmText: 'Delete',
        variant: 'destructive',
      })
      .then(async (ok) => {
        if (!ok) {
          return;
        }
        setBusy(true);
        try {
          await deleteExecutionProfile(orgId, profile.id);
          await refresh();
          onDeleted();
        } catch (err) {
          toast.add({ title: err instanceof Error ? err.message : 'Could not delete profile' });
        } finally {
          setBusy(false);
        }
      });
  };

  return (
    <div className="flex flex-col gap-6 py-1">
      <SettingsSection
        label="Details"
        testId={`profile-details-${profile.id}`}
        actions={
          <SettingsSave
            dirty={detailsDirty}
            pending={busy}
            invalid={name.trim().length === 0}
            onSave={() => void onSaveDetails()}
            onDiscard={() => {
              setName(profile.name);
              setIsolation(profile.isolation);
              setDockerImage(profile.dockerImage ?? '');
            }}
            testId={`profile-details-save-${profile.id}`}
          />
        }
      >
        <SettingsField label="Name" htmlFor={`profile-edit-name-${profile.id}`}>
          <Input
            id={`profile-edit-name-${profile.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="fleet-profile-edit-name"
          />
        </SettingsField>
        <SettingsField
          label="Isolation"
          htmlFor={`profile-isolation-${profile.id}`}
          description="Container runs each agent in a Docker workspace on the host."
        >
          <Select
            value={isolation}
            onValueChange={(value) => {
              if (value === 'host' || value === 'container') {
                setIsolation(value);
              }
            }}
          >
            <SelectTrigger id={`profile-isolation-${profile.id}`} className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="host">Host</SelectItem>
              <SelectItem value="container">Container</SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
        {isolation === 'container' ? (
          <SettingsField
            label="Docker image"
            htmlFor={`profile-docker-image-${profile.id}`}
            description="Leave empty for the built-in default."
          >
            <Input
              id={`profile-docker-image-${profile.id}`}
              value={dockerImage}
              onChange={(event) => setDockerImage(event.target.value)}
              placeholder="Default"
              data-testid="fleet-profile-docker-image"
            />
          </SettingsField>
        ) : null}
      </SettingsSection>

      <SettingsSection
        label="Assigned hosts"
        count={nodeIds.size}
        description="Checked hosts can take runs for this profile."
        testId={`profile-hosts-${profile.id}`}
        actions={
          <SettingsSave
            dirty={nodesDirty}
            pending={busy}
            onSave={() => void onSaveNodes()}
            onDiscard={() => setNodeIds(new Set(profile.nodeIds))}
            testId={`profile-hosts-save-${profile.id}`}
          />
        }
      >
        {nodes.length === 0 ? (
          <SettingsEmpty
            title="No hosts available"
            description="Machines appear here once they join the organization."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {nodes.map((node) => {
              const locked = profile.system && node.role === 'relay';
              const status = resolveHostStatus(node);
              return (
                <li key={node.id}>
                  <label
                    htmlFor={`profile-node-${node.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 py-2',
                      locked && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <Checkbox
                      id={`profile-node-${node.id}`}
                      checked={nodeIds.has(node.id)}
                      disabled={locked || busy}
                      onCheckedChange={() =>
                        setNodeIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(node.id)) {
                            next.delete(node.id);
                          } else {
                            next.add(node.id);
                          }
                          return next;
                        })
                      }
                      data-testid={`fleet-profile-node-${node.id}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{node.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {node.role === 'relay' ? 'Server' : 'Worker'} · {hostStatusLabel(status)}
                      </span>
                    </span>
                    {locked ? <RowChip>required</RowChip> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      <PlacementQueueSection orgId={orgId} profileId={profile.id} profileName={profile.name} />

      <DangerZone
        title={profile.isDefault ? 'Default profile' : 'Delete profile'}
        description={
          profile.isDefault
            ? 'This is the default profile; runs without an explicit profile use it.'
            : 'Runs that target this profile will fall back to the default.'
        }
        testId={`profile-danger-${profile.id}`}
      >
        {!profile.isDefault ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onSetDefault()}
            data-testid={`fleet-profile-default-${profile.id}`}
          >
            Set default
          </Button>
        ) : null}
        {!profile.system ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={onDelete}
            data-testid={`fleet-profile-delete-${profile.id}`}
          >
            Delete
          </Button>
        ) : null}
      </DangerZone>
    </div>
  );
}

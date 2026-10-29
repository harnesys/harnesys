import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createExecutionProfile,
  executionProfilesQuery,
  executionProfilesQueryKey,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import {
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsField,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { ProfileDetail } from './profile-detail';

export function ProfilesPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { data: response, isPending } = useQuery(executionProfilesQuery(orgId));
  const profiles = response?.items ?? [];
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: executionProfilesQueryKey(orgId) });
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createExecutionProfile(orgId, name);
      setNewName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-8" data-testid="profiles-pane">
      {error ? <SettingsErrorBanner message={error} testId="fleet-profiles-error" /> : null}

      <SettingsSection
        label="Profiles"
        count={isPending ? undefined : profiles.length}
        description="Pools of hosts where agents are allowed to run."
        testId="fleet-profiles"
      >
        <SettingsField
          label="New profile"
          description="Name it after the machines it points at, e.g. Laptop workers."
          htmlFor="profile-name"
        >
          <div className="flex items-center gap-2">
            <Input
              id="profile-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Laptop workers"
              data-testid="fleet-profile-name"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void onCreate();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !newName.trim()}
              onClick={() => void onCreate()}
              data-testid="fleet-profile-create"
            >
              Create
            </Button>
          </div>
        </SettingsField>

        {profiles.length === 0 ? (
          <SettingsEmpty
            title="No profiles yet"
            description="Create a profile, then assign hosts that can take work for it."
            testId="fleet-profiles-empty"
          />
        ) : (
          <RowList testId="fleet-profiles-list">
            {profiles.map((profile) => {
              const selected = profile.id === selectedProfileId;
              return (
                <Row
                  key={profile.id}
                  testId={`fleet-profile-${profile.id}`}
                  title={profile.name}
                  mono={false}
                  chips={
                    <>
                      <RowChip>
                        {profile.nodeIds.length} {profile.nodeIds.length === 1 ? 'host' : 'hosts'}
                      </RowChip>
                      {profile.isDefault ? <RowChip tone="accent">default</RowChip> : null}
                      {profile.system ? <RowChip>system</RowChip> : null}
                    </>
                  }
                  expanded={selected}
                  onToggle={() => setSelectedProfileId(selected ? null : profile.id)}
                >
                  {selected ? (
                    <ProfileDetail
                      key={`${orgId}:${profile.id}`}
                      orgId={orgId}
                      profile={profile}
                      onDeleted={() => setSelectedProfileId(null)}
                    />
                  ) : null}
                </Row>
              );
            })}
          </RowList>
        )}
      </SettingsSection>
    </div>
  );
}

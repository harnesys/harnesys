import type { VcsSettings } from '@harnesys/contracts';
import { COMMIT_INSTRUCTIONS_MAX, DEFAULT_VCS_SETTINGS } from '@harnesys/contracts';
import type { GitMachineInfo } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranchIcon } from 'lucide-react';
import { useState } from 'react';
import { ModelSelect } from '@/features/manage-agent';
import { getGitMachineInfo, gitMachineInfoQueryKey, putGitMachineIdentity } from '@/shared/api/git';
import { orgSettingsQuery, orgSettingsQueryKey, patchOrgSettings } from '@/shared/api/org-skills';
import { Input } from '@/shared/ui/input';
import {
  RowListSkeleton,
  SettingsErrorBanner,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { GitStatusColorsSection } from './git-status-colors-section';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function VcsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(orgSettingsQuery(orgId));
  const machineQuery = useQuery({
    queryKey: gitMachineInfoQueryKey(orgId),
    queryFn: () => getGitMachineInfo(orgId),
    enabled: Boolean(orgId),
  });
  const [draft, setDraft] = useState<VcsSettings | null>(null);
  const saved = settingsQuery.data?.vcs ?? DEFAULT_VCS_SETTINGS;
  const current = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.commitModelId !== saved.commitModelId ||
      draft.commitInstructions !== saved.commitInstructions);

  const save = useMutation({
    mutationFn: () => patchOrgSettings(orgId, { vcs: current }),
    onSuccess: (next) => {
      setDraft(null);
      queryClient.setQueryData(orgSettingsQueryKey(orgId), next);
      toast.add({ title: 'VCS settings saved' });
    },
    onError: (error) => {
      toast.add({ title: 'Save failed', description: errorMessage(error) });
    },
  });

  function patchDraft(patch: Partial<VcsSettings>): void {
    setDraft({ ...current, ...patch });
  }

  return (
    <div className="flex w-full flex-col gap-8" data-testid="vcs-pane">
      <SettingsSection
        label="Commit message"
        description="The model and format used by the generate button in the commit dialog."
        testId="vcs-commit"
        actions={
          <SettingsSave
            dirty={dirty}
            pending={save.isPending}
            onSave={() => save.mutate()}
            onDiscard={() => setDraft(null)}
            testId="vcs-save"
          />
        }
      >
        <SettingsField
          label="Model"
          description="Leave on automatic to use the first enabled chat model."
          testId="vcs-commit-model"
        >
          <ModelSelect
            orgId={orgId}
            value={current.commitModelId || null}
            onChange={(next) => patchDraft({ commitModelId: next ?? '' })}
            emptyLabel="Automatic (first chat model)"
            placeholder="Select model"
            triggerClassName="w-64"
            size="sm"
          />
        </SettingsField>
        <SettingsField
          label="Instructions"
          description="Format, tone, and language rules the model must follow. Empty means a concise imperative subject with an optional body."
          testId="vcs-commit-instructions"
        >
          <Textarea
            value={current.commitInstructions}
            onChange={(event) => patchDraft({ commitInstructions: event.target.value })}
            maxLength={COMMIT_INSTRUCTIONS_MAX}
            rows={6}
            placeholder="e.g. Conventional Commits: type(scope): summary. Body explains why. Write in English."
            className="min-h-[120px] w-full resize-y font-mono text-xs"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        label="Git on this machine"
        description="Identity used for commits and pushes made on the host running this workspace. Saved to the global git config."
        testId="vcs-machine"
      >
        <MachineGitDetails
          orgId={orgId}
          info={machineQuery.data}
          error={machineQuery.isError ? errorMessage(machineQuery.error) : null}
          loading={machineQuery.isLoading}
        />
      </SettingsSection>

      <GitStatusColorsSection />
    </div>
  );
}

function MachineGitDetails({
  orgId,
  info,
  error,
  loading,
}: {
  orgId: string;
  info: GitMachineInfo | undefined;
  error: string | null;
  loading: boolean;
}) {
  if (loading) {
    return <RowListSkeleton rows={2} testId="vcs-machine-loading" />;
  }
  if (error) {
    return <SettingsErrorBanner message={error} />;
  }
  if (!info) {
    return null;
  }
  return <GitIdentityForm orgId={orgId} info={info} />;
}

function GitIdentityForm({ orgId, info }: { orgId: string; info: GitMachineInfo }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(info.userName ?? '');
  const [email, setEmail] = useState(info.userEmail ?? '');
  const dirty = name !== (info.userName ?? '') || email !== (info.userEmail ?? '');

  const save = useMutation({
    mutationFn: () =>
      putGitMachineIdentity(orgId, { userName: name.trim(), userEmail: email.trim() }),
    onSuccess: (next) => {
      queryClient.setQueryData(gitMachineInfoQueryKey(orgId), next);
      toast.add({ title: 'Git identity saved' });
    },
    onError: (error) => {
      toast.add({ title: 'Save failed', description: errorMessage(error) });
    },
  });

  return (
    <div className="flex w-full flex-col gap-4" data-testid="git-identity-form">
      <div className="flex flex-wrap items-center gap-2 px-1 py-1">
        <GitBranchIcon className="size-4 text-muted-foreground" />
        {info.version ? (
          <span className="font-medium text-sm">Git {info.version}</span>
        ) : (
          <span className="font-medium text-sm text-status-warn">Git not found on this host</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsField label="user.name" description="Commit author name." htmlFor="git-user-name">
          <Input
            id="git-user-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            className="h-8"
            data-testid="git-user-name"
          />
        </SettingsField>
        <SettingsField
          label="user.email"
          description="Commit author email."
          htmlFor="git-user-email"
        >
          <Input
            id="git-user-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="h-8"
            data-testid="git-user-email"
          />
        </SettingsField>
      </div>
      <SettingsSave
        dirty={dirty}
        pending={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={() => {
          setName(info.userName ?? '');
          setEmail(info.userEmail ?? '');
        }}
        testId="git-identity-save"
      />
    </div>
  );
}

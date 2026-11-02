import type { ToolchainMode, ToolchainSettings } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { installOrgLspBinary, orgLspQueryKey } from '@/shared/api/org-lsp';
import { orgSettingsQuery, orgSettingsQueryKey, patchOrgSettings } from '@/shared/api/org-skills';
import {
  orgToolchainQuery,
  orgToolchainQueryKey,
  refreshOrgToolchain,
} from '@/shared/api/org-toolchain';
import { Button } from '@/shared/ui/button';
import { RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  RowListSkeleton,
  SettingsErrorBanner,
  SettingsField,
  SettingsSave,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { OrgToolchainCommands } from './org-toolchain-commands';

const DEFAULT_TOOLCHAIN: ToolchainSettings = {
  mode: 'auto',
  shell: 'auto',
  node: 'auto',
  extraPathDirs: [],
  commandOverrides: {},
};

const MODE_LABEL: Record<ToolchainMode, string> = {
  auto: 'Auto',
  custom: 'Custom',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function OrgToolchainPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const discovery = useQuery(orgToolchainQuery(orgId));
  const settingsQuery = useQuery(orgSettingsQuery(orgId));
  const [draft, setDraft] = useState<ToolchainSettings | null>(null);
  const [extraDir, setExtraDir] = useState('');

  const saved = settingsQuery.data?.toolchain ?? DEFAULT_TOOLCHAIN;
  const current = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  function patchDraft(patch: Partial<ToolchainSettings>): void {
    setDraft({ ...current, ...patch });
  }

  function invalidateResults(): void {
    void queryClient.invalidateQueries({ queryKey: orgToolchainQueryKey(orgId) });
    void queryClient.invalidateQueries({ queryKey: orgLspQueryKey(orgId) });
  }

  const save = useMutation({
    mutationFn: () => patchOrgSettings(orgId, { toolchain: current }),
    onSuccess: (next) => {
      setDraft(next.toolchain);
      queryClient.setQueryData(orgSettingsQueryKey(orgId), next);
      invalidateResults();
      toast.add({ title: 'Toolchain settings saved' });
    },
    onError: (error) => {
      toast.add({ title: 'Save failed', description: errorMessage(error) });
    },
  });

  const reprobe = useMutation({
    mutationFn: () => refreshOrgToolchain(orgId),
    onSuccess: (next) => {
      queryClient.setQueryData(orgToolchainQueryKey(orgId), next);
      void queryClient.invalidateQueries({ queryKey: orgLspQueryKey(orgId) });
      toast.add({ title: 'Toolchain re-probed' });
    },
    onError: (error) => {
      toast.add({ title: 'Refresh failed', description: errorMessage(error) });
    },
  });

  const install = useMutation({
    mutationFn: (serverId: string) => installOrgLspBinary(orgId, serverId),
    onSuccess: () => {
      invalidateResults();
      toast.add({ title: 'Binary installed' });
    },
    onError: (error) => {
      toast.add({ title: 'Install failed', description: errorMessage(error) });
    },
  });

  const shells = discovery.data?.shells ?? [];
  const nodeVersions = discovery.data?.nodeVersions ?? [];

  return (
    <div className="flex w-full flex-col gap-8" data-testid="org-toolchain-pane">
      {discovery.isError && (
        <SettingsErrorBanner
          message={discovery.error instanceof Error ? discovery.error.message : 'Discovery failed'}
          onRetry={() => reprobe.mutate()}
        />
      )}

      <SettingsSection
        label="Resolution"
        description="How binaries are resolved for agents and language servers on this host."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={reprobe.isPending}
            onClick={() => reprobe.mutate()}
            data-testid="toolchain-refresh"
          >
            <RefreshCwIcon />
            Refresh
          </Button>
        }
      >
        <SettingsField
          label="Mode"
          description={
            current.mode === 'custom'
              ? 'Only discovered global bin directories and the extras below are on PATH — no login-shell probe.'
              : 'Probe the login shell for PATH, then add discovered global bin directories.'
          }
          htmlFor="toolchain-mode"
        >
          <Select
            value={current.mode}
            onValueChange={(value) => patchDraft({ mode: (value ?? 'auto') as ToolchainMode })}
          >
            <SelectTrigger
              id="toolchain-mode"
              className="w-full"
              size="sm"
              data-testid="toolchain-mode"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">{MODE_LABEL.auto}</SelectItem>
                <SelectItem value="custom">{MODE_LABEL.custom}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>

        <SettingsField
          label="Shell"
          description="Login shell used to probe PATH in auto mode."
          htmlFor="toolchain-shell"
        >
          <Select
            value={current.shell}
            onValueChange={(value) => patchDraft({ shell: value ?? 'auto' })}
          >
            <SelectTrigger
              id="toolchain-shell"
              className="w-full"
              size="sm"
              data-testid="toolchain-shell"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">Auto</SelectItem>
                {shells.map((shell) => (
                  <SelectItem key={shell.path} value={shell.path}>
                    {shell.kind} — {shell.path}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>

        <SettingsField
          label="Node version"
          description="Pinned node bin directory goes first on PATH; its npm receives global installs."
          htmlFor="toolchain-node"
        >
          <Select
            value={current.node}
            onValueChange={(value) => patchDraft({ node: value ?? 'auto' })}
          >
            <SelectTrigger
              id="toolchain-node"
              className="w-full"
              size="sm"
              data-testid="toolchain-node"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">Auto — latest discovered</SelectItem>
                {nodeVersions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {version.manager} {version.version}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        label="Extra PATH directories"
        description="Added after the resolved PATH, tilde expansion allowed."
      >
        <div className="flex flex-col gap-2 pt-1">
          <RowList testId="toolchain-extra-dirs">
            {current.extraPathDirs.map((dir) => (
              <div
                key={dir}
                className="flex items-center justify-between rounded-md border px-3 py-1.5"
                data-testid="toolchain-extra-dir"
              >
                <span className="truncate font-mono text-xs">{dir}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${dir}`}
                  onClick={() =>
                    patchDraft({
                      extraPathDirs: current.extraPathDirs.filter((item) => item !== dir),
                    })
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </RowList>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Extra PATH directory"
              placeholder="~/bin or /absolute/dir"
              className="h-7 max-w-sm font-mono text-xs"
              value={extraDir}
              onChange={(event) => setExtraDir(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={extraDir.trim().length === 0}
              onClick={() => {
                patchDraft({ extraPathDirs: [...current.extraPathDirs, extraDir.trim()] });
                setExtraDir('');
              }}
            >
              <PlusIcon />
              Add
            </Button>
          </div>
        </div>
        <SettingsSave
          dirty={dirty}
          pending={save.isPending}
          onSave={() => save.mutate()}
          onDiscard={() => setDraft(saved)}
          testId="toolchain-save"
        />
      </SettingsSection>

      {discovery.isPending && !discovery.data ? (
        <SettingsSection label="Dependencies" description="Resolved through the effective PATH.">
          <RowListSkeleton rows={4} testId="toolchain-loading" />
        </SettingsSection>
      ) : (
        discovery.data && (
          <OrgToolchainCommands
            discovery={discovery.data}
            overrides={current.commandOverrides}
            onOverrideChange={(command, value) => {
              const overrides = { ...current.commandOverrides };
              if (value.trim().length === 0) {
                delete overrides[command];
              } else {
                overrides[command] = value.trim();
              }
              patchDraft({ commandOverrides: overrides });
            }}
            onInstall={(serverId) => install.mutate(serverId)}
            installBusy={install.isPending}
          />
        )
      )}

      <EffectivePathSection
        dirs={discovery.data?.effectiveDirs ?? []}
        pending={discovery.isPending}
      />
    </div>
  );
}

function EffectivePathSection({ dirs, pending }: { dirs: string[]; pending: boolean }) {
  return (
    <SettingsSection
      label="Effective PATH"
      description={
        dirs.length > 0
          ? `${dirs.length} directories, in resolution order.`
          : 'Press Refresh to see the resolved order.'
      }
    >
      {pending && dirs.length === 0 ? (
        <RowListSkeleton rows={3} testId="toolchain-effective-loading" />
      ) : (
        <div
          className="flex flex-col divide-y rounded-md border"
          data-testid="toolchain-effective-dirs"
        >
          {dirs.map((dir, index) => (
            <div key={dir} className="flex items-baseline gap-3 px-3 py-1.5">
              <span className="w-4 shrink-0 text-right text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="truncate font-mono text-xs">{dir}</span>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

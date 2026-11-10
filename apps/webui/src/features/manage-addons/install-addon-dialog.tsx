import type { AddonDiscoverView, InstallPlan } from '@harnesys/contracts';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { confirmAddonInstall, planAddonInstall } from '@/shared/api/addon-packages';
import { apiJson } from '@/shared/api/client';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowList } from '@/shared/ui/capability-rows';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { RowListSkeleton, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { PermissionRow } from './consent-rows';

export interface InstallAddonDialogData {
  source?: string;
}

function discoverQuery() {
  return queryOptions({
    queryKey: ['addon-discover'] as const,
    queryFn: () => apiJson<{ items: AddonDiscoverView[] }>('/api/addons/packages/discover'),
  });
}

export function InstallAddonDialog({
  onResolve,
  data,
}: DialogComponentProps<boolean, InstallAddonDialogData>) {
  const queryClient = useQueryClient();
  const discover = useQuery(discoverQuery());
  const [source, setSource] = useState(data?.source ?? '');
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['addon-packages'] });
    void queryClient.invalidateQueries({ queryKey: ['addon-discover'] });
  };

  const installSource = async (packageSource: string) => {
    setPending(true);
    setError(null);
    try {
      const nextPlan = await planAddonInstall({ source: packageSource });
      await confirmAddonInstall(nextPlan.planId);
      toast.add({
        type: 'success',
        title: `${nextPlan.id}@${nextPlan.version} installed`,
      });
      refresh();
      onResolve?.(true);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const startPlan = async () => {
    setPending(true);
    setError(null);
    setPlan(null);
    try {
      setPlan(await planAddonInstall({ source }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const confirmPlan = async () => {
    if (!plan) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await confirmAddonInstall(plan.planId);
      toast.add({ type: 'success', title: `${plan.id}@${plan.version} installed` });
      refresh();
      onResolve?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  const items = discover.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      {error ? <SettingsErrorBanner message={error} testId="install-addon-error" /> : null}
      {discover.isPending ? <RowListSkeleton rows={2} testId="install-addon-skeleton" /> : null}
      {items.length > 0 ? (
        <RowList testId="install-addon-discover">
          {items.map((item) => (
            <div
              key={item.source}
              className="flex min-w-0 items-center gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{item.title}</p>
                <p className="truncate text-muted-foreground text-xs">{item.description}</p>
              </div>
              {item.installed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void installSource(item.source)}
                  data-testid={`install-addon-reinstall-${item.source}`}
                >
                  Reinstall
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void installSource(item.source)}
                  data-testid={`install-addon-item-${item.source}`}
                >
                  Install
                </Button>
              )}
            </div>
          ))}
        </RowList>
      ) : null}
      {!discover.isPending ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="h-px flex-1 bg-border" />
          <span className="uppercase">or install from a repository</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      <Field>
        <FieldLabel htmlFor="install-addon-source">Repository URL or path</FieldLabel>
        <Input
          id="install-addon-source"
          className="font-mono text-xs"
          placeholder="https://github.com/org/repo"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          data-testid="install-addon-source"
        />
      </Field>
      {plan ? (
        <div
          className="flex flex-col gap-2 rounded-md border px-3 py-2"
          data-testid="install-addon-plan"
        >
          <p className="font-medium text-sm">
            {plan.id}@{plan.version} — {plan.trust}
          </p>
          {plan.warnings.map((warning) => (
            <p key={warning} className="text-status-warn text-xs">
              {warning}
            </p>
          ))}
          {plan.permissions.map((permission) => (
            <PermissionRow key={permission.id} permission={permission} />
          ))}
        </div>
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        {plan ? (
          <Button
            disabled={pending}
            onClick={() => void confirmPlan()}
            data-testid="install-addon-confirm"
          >
            Confirm install
          </Button>
        ) : (
          <Button
            disabled={pending || !source}
            onClick={() => void startPlan()}
            data-testid="install-addon-plan"
          >
            {pending ? 'Scanning…' : 'Plan install'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

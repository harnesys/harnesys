import type { InstallPlan } from '@harnesys/contracts';
import { useState } from 'react';
import { confirmAddonInstall, planAddonInstall } from '@/shared/api/addon-packages';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { PermissionRow } from './consent-rows';

export interface InstallAddonDialogData {
  source?: string;
}

export function InstallAddonDialog({
  onResolve,
  data,
}: DialogComponentProps<boolean, InstallAddonDialogData>) {
  const [source, setSource] = useState(data?.source ?? '');
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onResolve?.(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <SettingsErrorBanner message={error} testId="install-addon-error" /> : null}
      <Field>
        <FieldLabel htmlFor="install-addon-source">Package path or URL</FieldLabel>
        <Input
          id="install-addon-source"
          className="font-mono text-xs"
          placeholder="/path/to/add-on or https://github.com/org/repo"
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
            Install
          </Button>
        ) : (
          <Button
            disabled={pending || !source}
            onClick={() => void startPlan()}
            data-testid="install-addon-plan"
          >
            {pending ? 'Scanning...' : 'Review package'}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

import type { UpdateDashboardBody } from '@harnesys/contracts';
import { useState } from 'react';
import {
  useCreateDashboard,
  useDeleteDashboard,
  useUpdateDashboard,
} from '@/features/dashboards/dashboards-queries';
import { DEFAULT_ICON } from '@/features/dashboards/model/icon-options';
import { useOrgId } from '@/shared/config/location';
import { alert, type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { ColorSwatches } from '@/shared/ui/color-swatches';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { IconPicker } from './icon-picker';

export type DashboardSettingsResult =
  | { action: 'created'; dashboardId: string }
  | { action: 'saved' }
  | { action: 'removed' };

export interface DashboardSettingsData {
  dashboardId?: string;
  mode: 'create' | 'edit';
  /** Current values prefilled into the form (edit mode). */
  initial?: { name: string; color: string | null; icon: string };
}

export function openDashboardCreateDialog() {
  return dialog.open(DashboardSettingsDialog, {
    title: 'New dashboard',
    description: 'Name the dashboard and pick its color and icon.',
    data: { mode: 'create' },
    className: 'sm:max-w-md',
  });
}

export interface DashboardSettingsInitial {
  name: string;
  color: string | null;
  icon: string;
}

export function openDashboardSettingsDialog(
  dashboardId: string,
  initial: DashboardSettingsInitial,
) {
  return dialog.open(DashboardSettingsDialog, {
    title: 'Dashboard settings',
    data: { mode: 'edit', dashboardId, initial },
    className: 'sm:max-w-md',
  });
}

export function DashboardSettingsDialog({
  onResolve,
  data,
}: DialogComponentProps<DashboardSettingsResult, DashboardSettingsData>) {
  const orgId = useOrgId() ?? '';
  const creating = data?.mode === 'create';
  const dashboardId = data?.dashboardId ?? '';
  const create = useCreateDashboard(orgId);
  const update = useUpdateDashboard(orgId, dashboardId);
  const remove = useDeleteDashboard(orgId);

  const [name, setName] = useState(data?.initial?.name ?? '');
  const [color, setColor] = useState<string | null>(data?.initial?.color ?? null);
  const [icon, setIcon] = useState(data?.initial?.icon ?? DEFAULT_ICON);
  const saving = create.isPending || update.isPending || remove.isPending;

  const canSave = name.trim().length > 0 && !saving;

  const save = (): void => {
    if (!canSave) {
      return;
    }
    if (creating) {
      create.mutate(
        { name: name.trim(), color, icon },
        {
          onSuccess: (result) => onResolve?.({ action: 'created', dashboardId: result.id }),
          onError: () => toast.add({ title: 'Failed to create dashboard', type: 'error' }),
        },
      );
      return;
    }
    const body: UpdateDashboardBody = { name: name.trim(), color, icon };
    update.mutate(body, {
      onSuccess: () => onResolve?.({ action: 'saved' }),
      onError: () => toast.add({ title: 'Failed to save dashboard', type: 'error' }),
    });
  };

  const deleteDashboard = async (): Promise<void> => {
    const confirmed = await alert.confirm({
      title: 'Delete dashboard?',
      description: 'This dashboard and all of its widgets are removed. This cannot be undone.',
      confirmText: 'Delete dashboard',
      variant: 'destructive',
      testId: 'dashboard-settings-delete-confirm',
    });
    if (!confirmed) {
      return;
    }
    remove.mutate(dashboardId, {
      onSuccess: () => onResolve?.({ action: 'removed' }),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="dashboard-name">Name</FieldLabel>
            <Input
              id="dashboard-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              placeholder={creating ? 'e.g. Ops command center' : undefined}
              data-testid="dashboard-settings-name"
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel>Color</FieldLabel>
            <ColorSwatches
              value={color}
              onChange={setColor}
              testIdPrefix="dashboard-settings-color"
            />
          </Field>
          <Field>
            <FieldLabel>Icon</FieldLabel>
            <IconPicker
              value={icon}
              onChange={(name) => setIcon(name ?? DEFAULT_ICON)}
              color={color}
              testIdPrefix="dashboard-settings-icon"
            />
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter>
        {!creating ? (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            data-testid="dashboard-settings-delete"
            onClick={() => {
              void deleteDashboard();
            }}
          >
            Delete dashboard
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => onResolve?.()} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSave}
          onClick={save}
          data-testid="dashboard-settings-save"
        >
          {creating ? 'Create dashboard' : 'Save dashboard'}
        </Button>
      </DialogFooter>
    </div>
  );
}

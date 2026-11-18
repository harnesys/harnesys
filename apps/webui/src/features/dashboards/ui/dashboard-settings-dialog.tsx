import type { UpdateDashboardBody } from '@harnesys/contracts';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
  useCreateDashboard,
  useDeleteDashboard,
  useUpdateDashboard,
} from '@/features/dashboards/dashboards-queries';
import {
  DASHBOARD_ICON_OPTIONS,
  DEFAULT_DASHBOARD_ICON,
} from '@/features/dashboards/model/dashboard-icons';
import { useOrgId } from '@/shared/config/location';
import { entityColorTintClass, entityColorTintStyle } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { ColorSwatches } from '@/shared/ui/color-swatches';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

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
  const [icon, setIcon] = useState(data?.initial?.icon ?? DEFAULT_DASHBOARD_ICON);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
            <div className="flex flex-wrap gap-1.5">
              {DASHBOARD_ICON_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                const selected = icon === option.name;
                return (
                  <button
                    key={option.name}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted/60',
                      selected && cn('border-transparent', entityColorTintClass(color)),
                    )}
                    style={selected ? entityColorTintStyle(color) : undefined}
                    data-testid={`dashboard-settings-icon-${option.name}`}
                    onClick={() => setIcon(option.name)}
                  >
                    <OptionIcon className="size-4" />
                  </button>
                );
              })}
            </div>
          </Field>
        </FieldGroup>
        {!creating ? (
          <div className="space-y-2 border-t pt-4">
            {!confirmingDelete ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                data-testid="dashboard-settings-delete"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2Icon className="size-3.5" /> Delete dashboard
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  Delete this dashboard and all of its widgets? This cannot be undone.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  data-testid="dashboard-settings-delete-confirm"
                  disabled={saving}
                  onClick={() =>
                    remove.mutate(dashboardId, {
                      onSuccess: () => onResolve?.({ action: 'removed' }),
                    })
                  }
                >
                  Confirm delete
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
      <DialogFooter>
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

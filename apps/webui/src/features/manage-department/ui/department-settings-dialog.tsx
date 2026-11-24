import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import type { Department } from '@/entities/department';
import { alert, type DialogComponentProps, dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { toast } from '@/shared/ui/toast';
import {
  deleteDepartment,
  renameDepartment,
  setDepartmentLead,
} from '../model/department-mutations';

export type DepartmentSettingsResult = 'saved' | 'deleted' | null;

interface DepartmentSettingsDialogData {
  department: Department;
  members: Agent[];
}

function DepartmentSettingsDialog({
  data,
  onResolve,
}: DialogComponentProps<DepartmentSettingsResult, DepartmentSettingsDialogData>) {
  const department = data?.department;
  const members = data?.members ?? [];
  const [name, setName] = useState(department?.name ?? '');
  const [leadAgentId, setLeadAgentId] = useState(department?.leadAgentId ?? '');
  const [busy, setBusy] = useState(false);

  if (!department) {
    onResolve?.(null);
    return null;
  }

  const save = async (): Promise<DepartmentSettingsResult> => {
    setBusy(true);
    try {
      const nextName = name.trim();
      const nextLead = leadAgentId === '' ? null : leadAgentId;
      if (nextName !== department.name) {
        await renameDepartment(department.orgId, department.id, nextName);
      }
      if (nextLead !== department.leadAgentId) {
        await setDepartmentLead(department.orgId, department.id, nextLead);
      }
      return 'saved';
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not save department',
      });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<DepartmentSettingsResult> => {
    const confirmed = await alert.confirm({
      title: `Delete ${department.name}?`,
      description: 'Agents in this department will be moved to Ungrouped.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) {
      return null;
    }
    try {
      await deleteDepartment(department.orgId, department.id);
      return 'deleted';
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not delete department',
      });
      return null;
    }
  };

  const submit = async (action: () => Promise<DepartmentSettingsResult>) => {
    const result = await action();
    if (result) {
      onResolve?.(result);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="department-settings-dialog">
      <FieldGroup className="gap-3">
        <Field data-testid={`department-settings-name-${department.id}`}>
          <FieldLabel>Name</FieldLabel>
          <Input
            value={name}
            placeholder="Department name"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field data-testid={`department-settings-lead-${department.id}`}>
          <FieldLabel>Lead agent</FieldLabel>
          <Select
            value={leadAgentId}
            items={{
              '': 'No lead',
              ...Object.fromEntries(members.map((agent) => [agent.id, agent.name])),
            }}
            onValueChange={(next) => setLeadAgentId(next ?? '')}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder="No lead" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No lead</SelectItem>
              {members.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-destructive hover:text-destructive"
          disabled={busy}
          data-testid={`department-settings-delete-${department.id}`}
          onClick={() => void submit(remove)}
        >
          Delete
        </Button>
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button type="button" disabled={busy || !name.trim()} onClick={() => void submit(save)}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

export function openDepartmentSettingsDialog(
  data: DepartmentSettingsDialogData,
): Promise<DepartmentSettingsResult> {
  return dialog.open(DepartmentSettingsDialog, {
    title: `Department settings · ${data.department.name}`,
    testId: 'department-settings',
    className: 'sm:max-w-lg',
    data,
  });
}

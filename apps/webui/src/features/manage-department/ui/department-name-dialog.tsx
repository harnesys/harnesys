import { useState } from 'react';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { dialog } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface DepartmentNameDialogData {
  title: string;
  initialValue?: string;
  submitLabel?: string;
}

function DepartmentNameDialog({
  data,
  onResolve,
}: DialogComponentProps<string | null, DepartmentNameDialogData>) {
  const [value, setValue] = useState(data?.initialValue ?? '');
  const submit = () => {
    const name = value.trim();
    onResolve?.(name || null);
  };
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="department-name-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        data-testid="department-name-input"
        value={value}
        placeholder="Department name"
        autoFocus
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onResolve?.(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!value.trim()}>
          {data?.submitLabel ?? 'Save'}
        </Button>
      </div>
    </form>
  );
}

export function openDepartmentNameDialog(data: DepartmentNameDialogData): Promise<string | null> {
  return dialog.open(DepartmentNameDialog, {
    title: data.title,
    testId: 'department-name-dialog',
    data,
  });
}

import type {
  AccountKindDescriptor,
  AccountView,
  AppKindDescriptor,
  AppView,
  FieldSpec,
  FieldValue,
} from '@harnesys/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { appsQueryKey, updateAccount, updateApp } from '@/shared/api/apps';
import { ApiError } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { initialFieldValues } from '../model/field-value.ts';
import { FieldRenderer } from './fields/field-renderer.tsx';

export function EditAppDialog({
  orgId,
  app,
  kind,
  onClose,
}: {
  orgId: string;
  app: AppView;
  kind: AppKindDescriptor;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editable = kind.fields.filter((field) => field.editable && field.type !== 'secret');
  const secretFields = kind.fields.filter((field) => field.type === 'secret');
  const [label, setLabel] = useState(app.label);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    initialFieldValues(editable, app.values),
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      updateApp(orgId, app.id, {
        label: label.trim(),
        values,
        secrets: Object.fromEntries(
          Object.entries(secrets).filter((entry) => entry[1].trim().length > 0),
        ),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: appsQueryKey(orgId) });
      onClose();
    },
    onError: (failure) => setError(failure.message),
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {app.label}</DialogTitle>
        </DialogHeader>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">Name</span>
          <input
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        {editable.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
        {secretFields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={undefined}
            secretValue={secrets[field.key]}
            existingSecret={app.secretFields.includes(field.key)}
            onChange={() => undefined}
            onSecretChange={(value) =>
              setSecrets((current) => ({ ...current, [field.key]: value }))
            }
          />
        ))}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || !label.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountDialog({
  orgId,
  account,
  kind,
  onClose,
}: {
  orgId: string;
  account: AccountView;
  kind: AccountKindDescriptor;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editable = kind.inputs.filter((field) => field.editable && field.type !== 'secret');
  const [label, setLabel] = useState(account.label);
  const [config, setConfig] = useState<Record<string, FieldValue>>(() =>
    initialFieldValues(editable, account.config),
  );
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => updateAccount(orgId, account.id, { label: label.trim(), config }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: appsQueryKey(orgId) });
      onClose();
    },
    onError: (failure: Error | ApiError) => setError(failure.message),
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {account.label}</DialogTitle>
        </DialogHeader>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">Name</span>
          <input
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        {editable.length === 0 ? (
          <p className="text-muted-foreground text-xs">This kind has no editable fields.</p>
        ) : null}
        {editable.map((field: FieldSpec) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={config[field.key]}
            onChange={(value) => setConfig((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || !label.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

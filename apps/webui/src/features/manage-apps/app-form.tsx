import type { AppKindSpec } from '@harnesys/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { appsQueryKey, createApp } from '@/shared/api/apps';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsErrorBanner, SettingsField } from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';

export function AppForm({
  orgId,
  kinds,
  onDone,
}: {
  orgId: string;
  kinds: AppKindSpec[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(kinds[0]?.kind ?? '');
  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const descriptor = kinds.find((entry) => entry.kind === kind) ?? null;

  const create = useMutation({
    mutationFn: () => createApp(orgId, { kind, label: label.trim(), values, secrets }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: appsQueryKey(orgId) });
      onDone();
    },
  });

  const update = (key: string, value: string, secret: boolean) => {
    const setter = secret ? setSecrets : setValues;
    setter((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      className="flex flex-col gap-1 rounded-md border border-border/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
      data-testid="app-form"
    >
      {create.error ? (
        <SettingsErrorBanner message={create.error.message} testId="app-form-error" />
      ) : null}
      <SettingsField label="Kind" description="What this application registers." htmlFor="app-kind">
        <Select
          value={kind}
          onValueChange={(next) => {
            if (!next) {
              return;
            }
            setKind(next);
            setValues({});
            setSecrets({});
          }}
        >
          <SelectTrigger id="app-kind" data-testid="app-kind-select">
            <SelectValue placeholder="Pick a kind" />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((entry) => (
              <SelectItem key={entry.kind} value={entry.kind}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
      {descriptor ? (
        <p className="px-1 pb-2 text-muted-foreground text-xs leading-4">
          {descriptor.description}
        </p>
      ) : null}
      <SettingsField
        label="Name"
        description="Shown whenever an add-on picks this application."
        htmlFor="app-label"
      >
        <Input
          id="app-label"
          value={label}
          placeholder="Work Google project"
          autoComplete="off"
          onChange={(event) => setLabel(event.target.value)}
          data-testid="app-label"
        />
      </SettingsField>
      {(descriptor?.fields ?? []).map((field) => (
        <SettingsField
          key={field.key}
          label={field.label}
          description={field.required ? 'Required' : 'Optional'}
          htmlFor={`app-field-${field.key}`}
        >
          {field.multiline ? (
            <Textarea
              id={`app-field-${field.key}`}
              rows={4}
              className="font-mono text-xs"
              placeholder={field.placeholder}
              value={(field.secret ? secrets[field.key] : values[field.key]) ?? ''}
              onChange={(event) => update(field.key, event.target.value, field.secret)}
              data-testid={`app-field-${field.key}`}
            />
          ) : (
            <Input
              id={`app-field-${field.key}`}
              type={field.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={field.placeholder}
              value={(field.secret ? secrets[field.key] : values[field.key]) ?? ''}
              onChange={(event) => update(field.key, event.target.value, field.secret)}
              data-testid={`app-field-${field.key}`}
            />
          )}
        </SettingsField>
      ))}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!kind || !label.trim() || create.isPending}
          data-testid="app-form-submit"
        >
          {create.isPending ? 'Saving...' : 'Add application'}
        </Button>
      </div>
    </form>
  );
}

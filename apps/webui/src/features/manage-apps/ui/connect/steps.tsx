import type {
  AccountKindDescriptor,
  AppKindDescriptor,
  AppView,
  FieldSpec,
  FieldValue,
} from '@harnesys/contracts';
import { FieldRenderer } from '@/shared/descriptor-forms';
import { Button } from '@/shared/ui/button';

interface StepAppProps {
  kinds: AppKindDescriptor[];
  kind: AppKindDescriptor;
  label: string;
  values: Record<string, FieldValue>;
  secrets: Record<string, string>;
  errors: Record<string, string>;
  pending: boolean;
  onKind: (kind: string) => void;
  onLabel: (label: string) => void;
  onField: (field: FieldSpec, value: FieldValue) => void;
  onSecret: (field: FieldSpec, value: string) => void;
  onCreate: () => void;
  onAuto: () => void;
}

export function StepApp({
  kinds,
  kind,
  label,
  values,
  secrets,
  errors,
  pending,
  onKind,
  onLabel,
  onField,
  onSecret,
  onCreate,
  onAuto,
}: StepAppProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{kind.description}</p>
      {kinds.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">Kind</span>
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={kind.kind}
            onChange={(event) => onKind(event.target.value)}
          >
            {kinds.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="flex flex-col gap-1 rounded-md border border-border/40 px-3 py-2">
        <p className="font-medium text-xs uppercase tracking-wide">How to get credentials</p>
        <ol className="list-decimal pl-4 text-muted-foreground text-xs leading-5">
          {kind.help.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {kind.help.consoleUrl ? (
          <a
            className="text-xs underline underline-offset-2"
            href={kind.help.consoleUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open provider console
          </a>
        ) : null}
      </div>
      {kind.capabilities.setup ? (
        <Button type="button" size="sm" disabled={pending} onClick={onAuto}>
          {pending ? 'Creating…' : 'Create automatically'}
        </Button>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {kind.capabilities.setup
          ? 'Or register it manually and paste the values.'
          : 'Create the application at the provider, then paste the values.'}
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">Name</span>
        <input
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={label}
          placeholder={kind.label}
          autoComplete="off"
          onChange={(event) => onLabel(event.target.value)}
        />
      </label>
      {kind.fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={values[field.key]}
          secretValue={secrets[field.key]}
          error={errors[field.key]}
          onChange={(value) => onField(field, value)}
          onSecretChange={(value) => onSecret(field, value)}
        />
      ))}
      <p className="text-muted-foreground text-xs">
        Redirect and webhook values appear after the application is created.
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !label.trim()}
          onClick={onCreate}
        >
          {pending ? 'Saving…' : 'Create manually'}
        </Button>
      </div>
    </div>
  );
}

export function StepPickApp({
  apps,
  value,
  onChange,
}: {
  apps: AppView[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        Pick the application this account connects through.
      </p>
      {apps.map((app) => (
        <label
          key={app.id}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-border/40 px-3 py-2"
        >
          <input
            type="radio"
            name="app"
            className="size-3.5 accent-primary"
            checked={value === app.id}
            onChange={() => onChange(app.id)}
          />
          <span className="text-sm">{app.label}</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground uppercase">
            {app.status}
          </span>
        </label>
      ))}
    </div>
  );
}

export function StepInputs({
  fields,
  values,
  secrets,
  errors,
  onField,
  onSecret,
}: {
  fields: FieldSpec[];
  values: Record<string, FieldValue>;
  secrets: Record<string, string>;
  errors: Record<string, string>;
  onField: (field: FieldSpec, value: FieldValue) => void;
  onSecret: (field: FieldSpec, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={values[field.key]}
          secretValue={secrets[field.key]}
          error={errors[field.key]}
          onChange={(value) => onField(field, value)}
          onSecretChange={(value) => onSecret(field, value)}
        />
      ))}
    </div>
  );
}

export function StepScopes({
  kind,
  selected,
  granted,
  onToggle,
}: {
  kind: AccountKindDescriptor;
  selected: string[];
  granted: string[];
  onToggle: (scope: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {kind.scopes.options.map((option) => {
        const locked = granted.includes(option.key);
        return (
          <label
            key={option.key}
            className="flex items-start gap-2 rounded-md border border-border/40 px-3 py-2"
          >
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 accent-primary"
              checked={selected.includes(option.key) || locked}
              disabled={locked}
              onChange={() => onToggle(option.key)}
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm">{option.label}</span>
              {option.description ? (
                <span className="text-muted-foreground text-xs">{option.description}</span>
              ) : null}
            </span>
            {locked ? (
              <span className="ml-auto text-[10px] text-muted-foreground uppercase">granted</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

export function StepConnect({
  kind,
  appLabel,
  scopes,
  onConnect,
  pending,
}: {
  kind: AccountKindDescriptor;
  appLabel: string | null;
  scopes: string[];
  onConnect: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{kind.description}</p>
      {appLabel ? <p className="text-sm">Application: {appLabel}</p> : null}
      <p className="text-sm">
        Scopes: {scopes.length > 0 ? scopes.join(', ') : 'the provider defaults'}
      </p>
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={pending} onClick={onConnect}>
          {pending ? 'Starting…' : 'Connect'}
        </Button>
      </div>
    </div>
  );
}

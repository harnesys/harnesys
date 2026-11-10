import type { FieldSpec, FieldValue, LaunchView } from '@harnesys/contracts';
import { CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { FieldRenderer } from '../fields/field-renderer.tsx';

export interface LaunchPanelProps {
  launch: LaunchView;
  errors: Record<string, string>;
  formError: string | null;
  pending: boolean;
  onFormResume: (inputs: Record<string, FieldValue>) => void;
}

export function LaunchPanel({
  launch,
  errors,
  formError,
  pending,
  onFormResume,
}: LaunchPanelProps) {
  if (launch.kind === 'device') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border/40 px-3 py-3">
        <p className="text-sm">Enter this code on the provider page.</p>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-widest">
            {launch.userCode}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Copy code"
            onClick={() => {
              void navigator.clipboard.writeText(launch.userCode);
            }}
          >
            <CopyIcon />
          </Button>
        </div>
        <a
          className="text-sm underline underline-offset-2"
          href={launch.verificationUri}
          target="_blank"
          rel="noreferrer"
        >
          Open verification page
        </a>
      </div>
    );
  }
  if (launch.kind === 'form') {
    return (
      <FormLaunchPanel
        key={launch.fields.map((field) => field.key).join('/')}
        text={launch.text ?? null}
        fields={launch.fields}
        errors={errors}
        pending={pending}
        formError={formError}
        onSubmit={onFormResume}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/40 px-3 py-3">
      <p className="text-sm">
        {launch.kind === 'redirect'
          ? 'Finish the authorization in the provider window. This dialog updates when it completes.'
          : 'Open the provider page, finish the steps there, then come back.'}
      </p>
      <a
        className="inline-flex w-fit items-center gap-1.5 text-sm underline underline-offset-2"
        href={launch.url}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLinkIcon className="size-3.5" />
        Open provider page
      </a>
    </div>
  );
}

function FormLaunchPanel({
  text,
  fields,
  errors,
  pending,
  onSubmit,
  formError,
}: {
  text: string | null;
  fields: FieldSpec[];
  errors: Record<string, string>;
  pending: boolean;
  formError: string | null;
  onSubmit: (inputs: Record<string, FieldValue>) => void;
}) {
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    initialFieldValues(fields),
  );
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/40 px-3 py-3">
      {text ? <p className="text-muted-foreground text-sm">{text}</p> : null}
      {fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
          disabled={pending}
          onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
        />
      ))}
      {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => onSubmit(fieldInputsOf(fields, values))}
        >
          {pending ? 'Submitting…' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}

function initialFieldValues(fields: readonly FieldSpec[]): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      output[field.key] = field.default;
    }
  }
  return output;
}

function fieldInputsOf(
  fields: readonly FieldSpec[],
  values: Readonly<Record<string, FieldValue>>,
): Record<string, FieldValue> {
  const output: Record<string, FieldValue> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value !== undefined && value !== '') {
      output[field.key] = value;
    }
  }
  return output;
}

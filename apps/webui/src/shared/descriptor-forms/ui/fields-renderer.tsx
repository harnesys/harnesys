import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import { fieldVisible } from '@harnesys/contracts';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { FieldRenderer } from './field-renderer';

/**
 * Recursive descriptor-form renderer: flat fields, `group` containers,
 * `visibleWhen` conditions, advanced/collapsible sections. Values stay flat
 * (`Record<string, FieldValue>` keyed by `field.key`) regardless of nesting.
 */
export function FieldsRenderer({
  fields,
  values,
  errors = {},
  disabled = false,
  onChange,
}: {
  fields: FieldSpec[];
  values: Record<string, FieldValue>;
  errors?: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: FieldValue) => void;
}) {
  return <>{renderFields(fields, values, errors, disabled, onChange)}</>;
}

function renderFields(
  fields: FieldSpec[],
  values: Record<string, FieldValue>,
  errors: Record<string, string>,
  disabled: boolean,
  onChange: (key: string, value: FieldValue) => void,
): ReactNode[] {
  const output: ReactNode[] = [];
  for (const field of fields) {
    if (field.generated || !fieldVisible(field, values)) {
      continue;
    }
    if (field.type === 'group') {
      output.push(
        <GroupField
          key={field.key}
          field={field}
          values={values}
          errors={errors}
          disabled={disabled}
          onChange={onChange}
        />,
      );
      continue;
    }
    output.push(
      <FieldRenderer
        key={field.key}
        field={field}
        value={values[field.key]}
        error={errors[field.key]}
        disabled={disabled}
        onChange={(value) => onChange(field.key, value)}
      />,
    );
  }
  return output;
}

function GroupField({
  field,
  values,
  errors,
  disabled,
  onChange,
}: {
  field: FieldSpec;
  values: Record<string, FieldValue>;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: FieldValue) => void;
}) {
  const [open, setOpen] = useState(!field.collapsible);
  const children = renderFields(field.fields ?? [], values, errors, disabled, onChange);
  const body = (
    <div
      className={gridClass(field.columns)}
      style={
        field.columns
          ? { gridTemplateColumns: `repeat(${field.columns}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {children}
    </div>
  );
  if (!field.collapsible && !field.advanced) {
    return (
      <section className="flex flex-col gap-3" data-testid={`field-group-${field.key}`}>
        <GroupHeading field={field} />
        {body}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3" data-testid={`field-group-${field.key}`}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3.5 text-muted-foreground" />
        )}
        <GroupHeading field={field} inline />
      </button>
      {open ? body : null}
    </section>
  );
}

function GroupHeading({ field, inline = false }: { field: FieldSpec; inline?: boolean }) {
  return (
    <span className="flex flex-col">
      <span
        className={`font-medium text-muted-foreground uppercase tracking-wide ${
          inline ? 'text-xs' : 'text-[11px]'
        }`}
      >
        {field.label}
      </span>
      {field.help ? <span className="text-muted-foreground text-xs">{field.help}</span> : null}
    </span>
  );
}

function gridClass(columns: number | undefined): string {
  return columns && columns > 1 ? 'grid items-start gap-3' : 'flex flex-col gap-3';
}

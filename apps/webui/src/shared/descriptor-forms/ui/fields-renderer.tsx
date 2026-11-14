import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import { fieldVisible } from '@harnesys/contracts';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { FieldRenderer } from './field-renderer';
import type { AddonFormContext } from './widget-registry';

interface RenderContext {
  values: Record<string, FieldValue>;
  errors: Record<string, string>;
  disabled: boolean;
  /** Add-on identity for widgets resolving `optionsFrom`. */
  addon?: AddonFormContext;
  onChange: (key: string, value: FieldValue) => void;
}

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
  addon,
  onChange,
}: {
  fields: FieldSpec[];
  values: Record<string, FieldValue>;
  errors?: Record<string, string>;
  disabled?: boolean;
  addon?: AddonFormContext;
  onChange: (key: string, value: FieldValue) => void;
}) {
  return <>{renderFields(fields, { values, errors, disabled, addon, onChange })}</>;
}

function renderFields(fields: FieldSpec[], context: RenderContext): ReactNode[] {
  const output: ReactNode[] = [];
  for (const field of fields) {
    if (field.generated || !fieldVisible(field, context.values)) {
      continue;
    }
    if (field.type === 'group') {
      output.push(<GroupField key={field.key} field={field} context={context} />);
      continue;
    }
    output.push(
      <FieldRenderer
        key={field.key}
        field={field}
        value={context.values[field.key]}
        error={context.errors[field.key]}
        disabled={context.disabled}
        values={context.values}
        addon={context.addon}
        onChange={(value) => context.onChange(field.key, value)}
      />,
    );
  }
  return output;
}

function GroupField({ field, context }: { field: FieldSpec; context: RenderContext }) {
  const [open, setOpen] = useState(!field.collapsible);
  const children = renderFields(field.fields ?? [], context);
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

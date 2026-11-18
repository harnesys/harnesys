import type { JsonValue } from '@harnesys/contracts';
import { useState } from 'react';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import type { PropFieldSpec } from '../../model/prop-fields';
import { coercePropValue, propToFormValue } from '../../model/widget-form';

interface ScalarFieldProps {
  spec: PropFieldSpec;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
}

/** One non-collection prop control: switch, select, color, textarea, JSON or input. */
export function ScalarField({ spec, value, onChange }: ScalarFieldProps): React.ReactNode {
  if (spec.control === 'switch') {
    return (
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <FieldLabel spec={spec} />
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked ? true : undefined)}
          aria-label={spec.label}
        />
      </div>
    );
  }
  if (spec.control === 'select') {
    return (
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <FieldLabel spec={spec} />
        <Select
          value={typeof value === 'string' ? value : undefined}
          onValueChange={(next) => next && onChange(next)}
        >
          <SelectTrigger size="sm" className="w-36" aria-label={spec.label}>
            <SelectValue placeholder="Pick" />
          </SelectTrigger>
          <SelectContent>
            {(spec.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (spec.control === 'color') {
    return (
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <FieldLabel spec={spec} />
        <input
          type="color"
          value={typeof value === 'string' && value !== '' ? value : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-14 cursor-pointer rounded border"
          aria-label={spec.label}
        />
      </div>
    );
  }
  if (spec.control === 'textarea') {
    return (
      <div className="flex flex-col gap-1 text-[13px]">
        <FieldLabel spec={spec} />
        <Textarea
          value={propToFormValue(spec, value)}
          onChange={(event) => onChange(coercePropValue(spec, event.target.value))}
          className="min-h-24 font-mono text-[11px]"
          aria-label={spec.label}
        />
      </div>
    );
  }
  if (spec.valueKind === 'json') {
    return <JsonField spec={spec} value={value} onChange={onChange} />;
  }
  return (
    <div className="flex items-center justify-between gap-2 text-[13px]">
      <FieldLabel spec={spec} />
      <Input
        type={spec.valueKind === 'number' ? 'number' : 'text'}
        value={propToFormValue(spec, value)}
        onChange={(event) => onChange(coercePropValue(spec, event.target.value))}
        className="h-7 w-44 text-[12px]"
        aria-label={spec.label}
      />
    </div>
  );
}

export function FieldLabel({ spec }: { spec: PropFieldSpec }): React.ReactNode {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-muted-foreground">{spec.label}</span>
      {spec.required ? <span className="shrink-0 text-destructive">*</span> : null}
      {spec.hint ? (
        <span className="truncate font-mono text-[10px] text-muted-foreground/60">{spec.hint}</span>
      ) : null}
    </span>
  );
}

/**
 * JSON-valued prop (arrays of open rows, objects and expression-capable
 * scalars). The local draft keeps typing intact; only parseable JSON reaches
 * the item props, and a blur restores the canonical form.
 */
function JsonField({ spec, value, onChange }: ScalarFieldProps): React.ReactNode {
  const canonical = propToFormValue(spec, value);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <FieldLabel spec={spec} />
      <Textarea
        value={draft ?? canonical}
        placeholder="[]"
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const parsed = coercePropValue(spec, raw);
          if (raw.trim() === '' || parsed !== undefined) {
            onChange(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
        className="min-h-16 font-mono text-[11px]"
        aria-label={spec.label}
      />
    </div>
  );
}

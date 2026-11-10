import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

interface FieldRendererProps {
  field: FieldSpec;
  value: FieldValue | undefined;
  secretValue?: string;
  existingSecret?: boolean;
  error?: string;
  disabled?: boolean;
  onChange: (value: FieldValue) => void;
  onSecretChange?: (value: string) => void;
}

export function FieldRenderer({
  field,
  value,
  secretValue,
  existingSecret = false,
  error,
  disabled = false,
  onChange,
  onSecretChange,
}: FieldRendererProps) {
  if (field.generated) {
    return null;
  }
  const id = `field-${field.key}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-invalid={error ? true : undefined}>
      <label htmlFor={id} className="font-medium text-sm leading-5">
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </label>
      {field.help ? <p className="text-muted-foreground text-xs leading-4">{field.help}</p> : null}
      <FieldControl
        field={field}
        id={id}
        value={value}
        secretValue={secretValue}
        existingSecret={existingSecret}
        disabled={disabled}
        onChange={onChange}
        onSecretChange={onSecretChange}
      />
      {error ? <p className="text-destructive text-xs leading-4">{error}</p> : null}
    </div>
  );
}

function FieldControl({
  field,
  id,
  value,
  secretValue,
  existingSecret,
  disabled,
  onChange,
  onSecretChange,
}: {
  field: FieldSpec;
  id: string;
  value: FieldValue | undefined;
  secretValue?: string;
  existingSecret: boolean;
  disabled: boolean;
  onChange: (value: FieldValue) => void;
  onSecretChange?: (value: string) => void;
}) {
  if (field.type === 'secret') {
    return (
      <SecretInput
        id={id}
        value={secretValue ?? ''}
        placeholder={existingSecret ? 'A value is already set' : field.placeholder}
        disabled={disabled}
        onChange={onSecretChange ?? (() => undefined)}
      />
    );
  }
  const displayed = value === undefined ? field.default : value;
  if (field.type === 'textarea') {
    return (
      <Textarea
        id={id}
        rows={4}
        placeholder={field.placeholder}
        disabled={disabled}
        value={String(displayed ?? '')}
        onChange={(event) => onChange(event.target.value)}
        data-testid={id}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select
        id={id}
        className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
        value={String(displayed ?? '')}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        data-testid={id}
      >
        <option value="">Select…</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-primary"
        checked={Boolean(displayed)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={id}
      />
    );
  }
  return (
    <Input
      id={id}
      type={inputType(field)}
      step={field.type === 'number' ? 'any' : undefined}
      placeholder={field.placeholder}
      disabled={disabled}
      autoComplete="off"
      value={String(displayed ?? '')}
      onChange={(event) => onChange(event.target.value)}
      data-testid={id}
    />
  );
}

function inputType(field: FieldSpec): 'number' | 'url' | 'text' {
  if (field.type === 'number') {
    return 'number';
  }
  return field.type === 'url' ? 'url' : 'text';
}

function SecretInput({
  id,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        className="pr-9 font-mono text-xs"
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={id}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-0.5 right-0.5"
        aria-label={visible ? 'Hide value' : 'Show value'}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}

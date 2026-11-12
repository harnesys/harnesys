import type { FieldSpec, FieldValue } from '@harnesys/contracts';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
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
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </FieldLabel>
      {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
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
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
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
    const options = field.options ?? [];
    return (
      <Select
        items={options.map((option) => ({ value: option.value, label: option.label }))}
        value={
          displayed === undefined || displayed === '' || displayed === null
            ? null
            : String(displayed)
        }
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onChange(next);
          }
        }}
      >
        <SelectTrigger id={id} className="w-full" data-testid={id}>
          <SelectValue placeholder={field.placeholder ?? 'Select...'} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <div className="flex pt-1">
        <Checkbox
          id={id}
          checked={Boolean(displayed)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true)}
          data-testid={id}
        />
      </div>
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

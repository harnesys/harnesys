import { type Control, Controller, type FieldPath } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import type { ModelFieldsInput } from '../model/model-fields';

export function RateLimitSettings({ control }: { control: Control<ModelFieldsInput> }) {
  return (
    <Field>
      <FieldLabel>Model rate limits</FieldLabel>
      <FieldDescription>
        Applied by this Harnesys instance before each call; provider-side limits still apply.
      </FieldDescription>
      <div className="grid grid-cols-2 gap-4">
        <RateLimitField
          control={control}
          name="rateLimits.rpm"
          label="Requests/min"
          placeholder="60"
        />
        <RateLimitField
          control={control}
          name="rateLimits.rpd"
          label="Requests/day"
          placeholder="1000"
        />
        <RateLimitField
          control={control}
          name="rateLimits.tpm"
          label="Tokens/min"
          placeholder="100000"
        />
        <RateLimitField
          control={control}
          name="rateLimits.tpd"
          label="Tokens/day"
          placeholder="1000000"
        />
      </div>
    </Field>
  );
}
function RateLimitField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<ModelFieldsInput>;
  name: FieldPath<ModelFieldsInput>;
  label: string;
  placeholder: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={`model-${name}`}>{label}</FieldLabel>
          <Input
            id={`model-${name}`}
            className="font-mono"
            inputMode="numeric"
            placeholder={placeholder}
            aria-invalid={fieldState.invalid || undefined}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
          />
          {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  );
}

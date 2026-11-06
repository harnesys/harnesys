import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

export function TelegramTermsField({
  id,
  label,
  description,
  placeholder,
  terms,
  testId,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  placeholder: string;
  terms: string[];
  testId: string;
  onChange: (terms: string[]) => void;
}) {
  const [value, setValue] = useState('');
  function commit(): void {
    const term = value.trim().toLowerCase();
    if (term.length > 0 && !terms.includes(term)) {
      onChange([...terms, term]);
    }
    setValue('');
  }
  return (
    <Field className="gap-1.5" data-testid={testId}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
        {terms.map((term) => (
          <span
            key={term}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
          >
            {term}
            <button
              type="button"
              aria-label={`Remove ${term}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(terms.filter((item) => item !== term))}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <Input
          id={id}
          className="min-w-28 flex-1 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
          placeholder={terms.length === 0 ? placeholder : ''}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Backspace' && value.length === 0 && terms.length > 0) {
              onChange(terms.slice(0, -1));
            }
          }}
          onBlur={commit}
        />
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

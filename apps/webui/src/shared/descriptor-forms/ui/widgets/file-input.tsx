import type { FieldValue } from '@harnesys/contracts';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { FieldError } from '@/shared/ui/field';

/**
 * File field: reads the chosen file as text into the form value. The value
 * travels in the JSON body like any other string field; the host body limit
 * stays the hard boundary, `maxKb` rejects earlier with a readable message.
 */
export function FileInput({
  id,
  value,
  maxKb,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  maxKb?: number;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: FieldValue) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="shrink-0"
          onClick={() => {
            document.getElementById(`${id}-picker`)?.click();
          }}
        >
          Choose file
        </Button>
        <input
          id={`${id}-picker`}
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={async (event) => {
            setError(null);
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            if (maxKb !== undefined && file.size > maxKb * 1024) {
              setError(`File exceeds ${maxKb} KiB`);
              return;
            }
            const text = await file.text();
            setFileName(file.name);
            onChange(text);
          }}
        />
        <span className="min-w-0 truncate text-muted-foreground text-sm">
          {fileName ??
            (value.length > 0
              ? `Loaded, ${value.length} characters`
              : (placeholder ?? 'No file chosen'))}
        </span>
        {fileName || value.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={disabled}
            onClick={() => {
              setFileName(null);
              onChange('');
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

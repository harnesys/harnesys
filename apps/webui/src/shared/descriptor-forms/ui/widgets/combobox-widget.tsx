import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { type FormWidgetProps, fieldControlId } from '../widget-registry';
import { useFieldOptions } from './use-field-options';

/**
 * Searchable single-value picker over static or `optionsFrom` options. A
 * failed or empty option source degrades to manual entry, never a dead field.
 */
export function ComboboxWidget({
  field,
  value,
  disabled,
  onChange,
  values,
  addon,
}: FormWidgetProps) {
  const { options, loading, failed } = useFieldOptions(field, values, addon);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    setQuery('');
  }, [open]);

  const current = value === undefined || value === null ? '' : String(value);
  const freeText = field.widget?.params?.freeText !== false;

  if (failed || (options.length === 0 && !loading)) {
    return (
      <div className="flex w-full flex-col gap-1">
        <Input
          id={fieldControlId(field.key)}
          placeholder={field.placeholder}
          disabled={disabled}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          data-testid={fieldControlId(field.key)}
        />
        {field.optionsFrom ? (
          <p className="text-muted-foreground text-xs">
            Options are unavailable — enter the value manually.
          </p>
        ) : null}
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = options.filter(
    (option) => !needle || `${option.value} ${option.label}`.toLowerCase().includes(needle),
  );
  const custom =
    freeText && query.trim().length > 0 && !options.some((option) => option.value === query.trim());
  const selectedLabel = options.find((option) => option.value === current)?.label ?? current;

  const pick = (next: string): void => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={fieldControlId(field.key)}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full justify-between font-normal"
            data-testid={fieldControlId(field.key)}
          />
        }
      >
        <span className="min-w-0 truncate">
          {selectedLabel || (
            <span className="text-muted-foreground">{field.placeholder ?? 'Select…'}</span>
          )}
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            placeholder={field.placeholder ?? 'Search…'}
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-2 py-4 text-center text-muted-foreground text-sm">Loading…</div>
          ) : null}
          {matches.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => pick(option.value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">
                {option.label}
                {option.label !== option.value ? (
                  <span className="text-muted-foreground"> ({option.value})</span>
                ) : null}
              </span>
              {current === option.value ? <CheckIcon className="size-4 shrink-0" /> : null}
            </button>
          ))}
          {custom ? (
            <button
              type="button"
              onClick={() => pick(query.trim())}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              data-testid={`${fieldControlId(field.key)}-custom`}
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                Use “{query.trim()}”
              </span>
            </button>
          ) : null}
          {!loading && matches.length === 0 && !custom ? (
            <div className="px-2 py-4 text-center text-muted-foreground text-sm">No matches</div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

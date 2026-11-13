import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { parseCommaList, serializeCommaList } from '../../model/comma-list';
import { type FormWidgetProps, fieldControlId } from '../widget-registry';
import { useFieldOptions } from './use-field-options';

/**
 * Free-form tag editor for a comma-separated string: type and press Enter or
 * comma, click a suggestion to add it, click a chip to drop it.
 */
export function TagsWidget({ field, value, disabled, onChange, values, addon }: FormWidgetProps) {
  const { options } = useFieldOptions(field, values, addon);
  const [draft, setDraft] = useState('');
  const items = parseCommaList(value);
  const suggestions = options.filter((option) => !items.includes(option.value));

  const commit = (raw: string): void => {
    const added = raw.split(',').map((item) => item.trim());
    const next = serializeCommaList([...items, ...added]);
    if (next !== serializeCommaList(items)) {
      onChange(next);
    }
    setDraft('');
  };
  const remove = (item: string): void => {
    onChange(items.filter((current) => current !== item).join(','));
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 data-[invalid=true]:border-destructive">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="gap-1 pr-1">
            {item}
            {disabled ? null : (
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => remove(item)}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        <Input
          id={fieldControlId(field.key)}
          className="h-6 min-w-24 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          placeholder={items.length === 0 ? field.placeholder : undefined}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit(draft);
            }
            if (event.key === 'Backspace' && draft === '' && items.length > 0) {
              remove(items[items.length - 1] ?? '');
            }
          }}
          data-testid={fieldControlId(field.key)}
        />
      </div>
      {suggestions.length > 0 ? (
        <div
          className="flex flex-wrap gap-1"
          data-testid={`${fieldControlId(field.key)}-suggestions`}
        >
          {suggestions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-muted-foreground text-xs"
              disabled={disabled}
              onClick={() => commit(option.value)}
            >
              + {option.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

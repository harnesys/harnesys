import type { FieldOption } from '@harnesys/contracts';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { parseCommaList, serializeCommaList } from '../../model/comma-list';
import { type FormWidgetProps, fieldControlId } from '../widget-registry';
import { useFieldOptions } from './use-field-options';

/**
 * Checkbox panel for a multi-valued option field: text search, grouping by the
 * `optionsFrom.groupKey` row field, select-all per group and overall, and a
 * selected counter. The value stays a comma-separated string; tokens outside
 * the option list are preserved. Without options the widget degrades to a
 * plain input, mirroring the chips widget.
 */
export function ChecklistWidget({
  field,
  value,
  disabled,
  onChange,
  values,
  addon,
}: FormWidgetProps) {
  const { options, loading, failed, blocked } = useFieldOptions(field, values, addon);
  const [query, setQuery] = useState('');
  const selected = new Set(parseCommaList(value));
  const testId = fieldControlId(field.key);

  if (failed && options.length === 0) {
    return (
      <Input
        id={testId}
        placeholder={field.placeholder}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
      />
    );
  }
  if (blocked) {
    return <p className="text-muted-foreground text-xs">Pick the dependent field first.</p>;
  }

  const needle = query.trim().toLowerCase();
  const matches = options.filter(
    (option) =>
      !needle ||
      `${option.value} ${option.label} ${option.group ?? ''}`.toLowerCase().includes(needle),
  );
  const groups = groupOptions(matches);
  const commit = (next: Set<string>): void => {
    const optionValues = new Set(options.map((option) => option.value));
    const unknown = parseCommaList(value).filter((item) => !optionValues.has(item));
    const known = options.filter((option) => next.has(option.value)).map((option) => option.value);
    onChange(serializeCommaList([...known, ...unknown]));
  };
  const toggle = (optionValue: string): void => {
    const next = new Set(selected);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    commit(next);
  };
  const selectAll = (): void => {
    commit(new Set([...selected, ...options.map((option) => option.value)]));
  };
  const clearAll = (): void => {
    commit(new Set<string>());
  };

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border px-3 py-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Search..."
            className="h-8 pl-8"
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
            data-testid={`${testId}-search`}
          />
        </div>
        <span className="shrink-0 text-muted-foreground text-xs" data-testid={`${testId}-count`}>
          {selected.size} selected
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || options.length === 0}
          onClick={selectAll}
          data-testid={`${testId}-select-all`}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || selected.size === 0}
          onClick={clearAll}
          data-testid={`${testId}-clear`}
        >
          Clear
        </Button>
      </div>
      {loading && options.length === 0 ? (
        <p className="text-muted-foreground text-xs">Loading...</p>
      ) : null}
      {!loading && matches.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {options.length === 0 ? 'No options available' : 'No matches'}
        </p>
      ) : null}
      <div className="max-h-72 overflow-y-auto">
        {groups.map(([group, groupOptions]) => (
          <div key={group} className="flex flex-col gap-1 py-1">
            {group !== '' ? (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group}
                </span>
                <GroupButtons
                  groupOptions={groupOptions}
                  selected={selected}
                  disabled={disabled}
                  testId={testId}
                  onSelect={() => {
                    commit(new Set([...selected, ...groupOptions.map((option) => option.value)]));
                  }}
                  onClear={() => {
                    const next = new Set(selected);
                    for (const option of groupOptions) {
                      next.delete(option.value);
                    }
                    commit(next);
                  }}
                />
              </div>
            ) : null}
            {groupOptions.map((option) => (
              <label
                key={option.value}
                htmlFor={`${testId}-${option.value}`}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent"
              >
                <Checkbox
                  id={`${testId}-${option.value}`}
                  checked={selected.has(option.value)}
                  disabled={disabled}
                  onCheckedChange={() => toggle(option.value)}
                  data-testid={`${testId}-${option.value}`}
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.label !== option.value && !option.label.includes(option.value) ? (
                  <span className="shrink-0 text-muted-foreground text-xs">{option.value}</span>
                ) : null}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupButtons({
  groupOptions,
  selected,
  disabled,
  testId,
  onSelect,
  onClear,
}: {
  groupOptions: FieldOption[];
  selected: Set<string>;
  disabled: boolean;
  testId: string;
  onSelect: () => void;
  onClear: () => void;
}) {
  const all = groupOptions.every((option) => selected.has(option.value));
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled || all}
        onClick={onSelect}
        data-testid={`${testId}-group-${groupOptions[0]?.group}-select`}
      >
        All
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled || !groupOptions.some((option) => selected.has(option.value))}
        onClick={onClear}
        data-testid={`${testId}-group-${groupOptions[0]?.group}-clear`}
      >
        None
      </Button>
    </span>
  );
}

function groupOptions(options: FieldOption[]): [string, FieldOption[]][] {
  const groups = new Map<string, FieldOption[]>();
  for (const option of options) {
    const key = option.group ?? '';
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [option]);
    } else {
      bucket.push(option);
    }
  }
  return [...groups.entries()];
}

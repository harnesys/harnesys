import type { JsonValue } from '@harnesys/contracts';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { PropFieldSpec } from '../../model/prop-fields';
import { exprToText, parseExprText } from './expr-field';
import { FieldLabel } from './field-control';

interface RecordFieldProps {
  spec: PropFieldSpec;
  value: JsonValue | undefined;
  options: string[];
  onChange: (value: JsonValue | undefined) => void;
}

interface Entry {
  key: string;
  value: JsonValue;
}

function entriesOf(value: JsonValue | undefined): Entry[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).map(([key, entry]) => ({ key, value: entry }));
}

function commit(entries: Entry[], onChange: (value: JsonValue | undefined) => void): void {
  if (entries.length === 0) {
    onChange(undefined);
    return;
  }
  const record: Record<string, JsonValue> = {};
  for (const entry of entries) {
    record[entry.key] = entry.value;
  }
  onChange(record);
}

/** Editor for `control: 'record'` props: a map of names to expression values. */
export function RecordField({ spec, value, options, onChange }: RecordFieldProps): React.ReactNode {
  const listId = useId();
  const entries = entriesOf(value);
  const update = (index: number, next: Partial<Entry>): void => {
    commit(
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...next } : entry)),
      onChange,
    );
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2.5">
      <FieldLabel spec={spec} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {entries.map((entry, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={entry.key}
            placeholder="name"
            onChange={(event) => update(index, { key: event.target.value })}
            className="h-6 w-24 font-mono text-[11px]"
            aria-label={`${spec.label} name`}
          />
          <Input
            value={exprToText(entry.value)}
            placeholder="state.value"
            list={listId}
            onChange={(event) => {
              const parsed = parseExprText(event.target.value);
              if (parsed === undefined) {
                commit(
                  entries.filter((_, entryIndex) => entryIndex !== index),
                  onChange,
                );
                return;
              }
              update(index, { value: parsed });
            }}
            className="h-6 flex-1 font-mono text-[11px]"
            aria-label={`${spec.label} value`}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove entry"
            onClick={() =>
              commit(
                entries.filter((_, entryIndex) => entryIndex !== index),
                onChange,
              )
            }
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground"
        onClick={() => {
          let index = entries.length + 1;
          while (entries.some((entry) => entry.key === `key${index}`)) {
            index += 1;
          }
          commit([...entries, { key: `key${index}`, value: '' }], onChange);
        }}
      >
        <PlusIcon /> Add entry
      </Button>
    </div>
  );
}

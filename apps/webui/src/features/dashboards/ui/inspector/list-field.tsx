import type { JsonValue } from '@harnesys/contracts';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { PropFieldSpec } from '../../model/prop-fields';
import { FieldLabel, ScalarField } from './field-control';

interface ListFieldProps {
  spec: PropFieldSpec;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
}

function isRow(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rowsOf(value: JsonValue | undefined): Record<string, JsonValue>[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function valuesOf(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function emptyRow(fields: PropFieldSpec[]): Record<string, JsonValue> {
  const row: Record<string, JsonValue> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      row[field.key] = field.defaultValue;
    }
  }
  return row;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [entry] = next.splice(from, 1);
  if (entry !== undefined) {
    next.splice(to, 0, entry);
  }
  return next;
}

function ReorderButtons({
  index,
  count,
  onMove,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
}): React.ReactNode {
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Move up"
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Move down"
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDownIcon />
      </Button>
    </>
  );
}

/** Editor for `control: 'list'` props: object rows or a list of scalars. */
export function ListField({ spec, value, onChange }: ListFieldProps): React.ReactNode {
  const fields = spec.fields;
  const rows = rowsOf(value);
  const scalars = valuesOf(value);
  const commitRows = (next: Record<string, JsonValue>[]): void => {
    onChange(next.length > 0 ? next : undefined);
  };
  const commitScalars = (next: JsonValue[]): void => {
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5">
      <FieldLabel spec={spec} />
      {fields !== undefined ? (
        <>
          {rows.map((row, index) => (
            <div key={index} className="flex flex-col gap-1.5 rounded-md border bg-background p-2">
              <div className="flex items-center justify-end gap-0.5">
                <ReorderButtons
                  index={index}
                  count={rows.length}
                  onMove={(to) => commitRows(move(rows, index, to))}
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove entry"
                  onClick={() => commitRows(rows.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <TrashIcon />
                </Button>
              </div>
              {fields.map((field) => (
                <ScalarField
                  key={field.key}
                  spec={field}
                  value={row[field.key]}
                  onChange={(next) => {
                    const patched = { ...row };
                    if (next === undefined) {
                      delete patched[field.key];
                    } else {
                      patched[field.key] = next;
                    }
                    commitRows(
                      rows.map((entry, rowIndex) => (rowIndex === index ? patched : entry)),
                    );
                  }}
                />
              ))}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="w-fit text-muted-foreground"
            onClick={() => commitRows([...rows, emptyRow(fields)])}
          >
            <PlusIcon /> Add entry
          </Button>
        </>
      ) : (
        <>
          {scalars.map((entry, index) => (
            <div key={index} className="flex items-center gap-1">
              <Input
                type={spec.element === 'number' ? 'number' : 'text'}
                value={typeof entry === 'string' || typeof entry === 'number' ? String(entry) : ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  const numeric = raw.trim() === '' ? 0 : Number(raw);
                  const next: JsonValue = spec.element === 'number' ? numeric : raw;
                  commitScalars(
                    scalars.map((item, itemIndex) => (itemIndex === index ? next : item)),
                  );
                }}
                className="h-6 flex-1 font-mono text-[11px]"
                aria-label={`${spec.label} ${index + 1}`}
              />
              <ReorderButtons
                index={index}
                count={scalars.length}
                onMove={(to) => commitScalars(move(scalars, index, to))}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove entry"
                onClick={() => commitScalars(scalars.filter((_, itemIndex) => itemIndex !== index))}
              >
                <TrashIcon />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="w-fit text-muted-foreground"
            onClick={() => commitScalars([...scalars, spec.element === 'number' ? 0 : ''])}
          >
            <PlusIcon /> Add entry
          </Button>
        </>
      )}
    </div>
  );
}

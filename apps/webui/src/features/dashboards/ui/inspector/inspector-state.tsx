import type { JsonValue } from '@harnesys/contracts';
import { JsonValueSchema } from '@harnesys/contracts';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';

interface StateEditorProps {
  state: Record<string, JsonValue>;
  persisted: string[];
  onChange: (state: Record<string, JsonValue>) => void;
  onPersistChange: (persisted: string[]) => void;
}

/** Initial widget state: keys bindable as `state.<key>`, values as JSON or text. */
export function StateEditor({
  state,
  persisted,
  onChange,
  onPersistChange,
}: StateEditorProps): React.ReactNode {
  const entries = Object.entries(state);
  const togglePersist = (key: string, on: boolean): void => {
    const next = on
      ? [...new Set([...persisted, key])]
      : persisted.filter((entry) => entry !== key);
    onPersistChange(next);
  };
  const rename = (index: number, nextKey: string): void => {
    const [previous] = entries[index] ?? [];
    if (previous === undefined || previous === nextKey) {
      return;
    }
    if (entries.some(([key], entryIndex) => entryIndex !== index && key === nextKey)) {
      return;
    }
    const next = entries.map(([key, value], entryIndex) => [
      entryIndex === index ? nextKey : key,
      value,
    ]);
    onChange(Object.fromEntries(next));
    if (persisted.includes(previous)) {
      onPersistChange(persisted.map((entry) => (entry === previous ? nextKey : entry)));
    }
  };
  const addKey = (): void => {
    let index = entries.length + 1;
    while (Object.hasOwn(state, `key${index}`)) {
      index += 1;
    }
    onChange({ ...state, [`key${index}`]: 0 });
  };
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([key, value], index) => (
        <div key={index} className="flex items-center gap-1">
          <Checkbox
            checked={persisted.includes(key)}
            aria-label="Persist state key"
            title="Store this key per widget on the server"
            onCheckedChange={(next) => togglePersist(key, Boolean(next))}
          />
          <Input
            value={key}
            placeholder="count"
            onChange={(event) => rename(index, event.target.value)}
            className="h-6 flex-1 font-mono text-[11px]"
            aria-label="State key"
          />
          <Input
            value={JSON.stringify(value)}
            placeholder="0 | true | &quot;text&quot;"
            onChange={(event) => {
              const next: Array<[string, JsonValue]> = [...entries];
              next[index] = [key, parseJsonOrText(event.target.value)];
              onChange(Object.fromEntries(next));
            }}
            className="h-6 flex-1 font-mono text-[11px]"
            aria-label="State value"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove state key"
            onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={addKey}>
        <PlusIcon /> Add key
      </Button>
      {entries.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70">
          State is the glue between primitives: buttons write it, metrics read it.
        </p>
      ) : null}
      {persisted.length > 0 ? (
        <p className="text-[10px] text-muted-foreground/70">Persisted: {persisted.join(', ')}</p>
      ) : null}
    </div>
  );
}

function parseJsonOrText(raw: string): JsonValue {
  try {
    const parsed = JsonValueSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : raw;
  } catch {
    return raw;
  }
}

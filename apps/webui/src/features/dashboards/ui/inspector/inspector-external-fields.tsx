import type { WidgetSource } from '@harnesys/contracts';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export function ExternalFields({
  source,
  onPatch,
}: {
  source: Extract<WidgetSource, { kind: 'external' }>;
  onPatch: (next: Partial<WidgetSource>) => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        value={source.url}
        placeholder="https://api.example.com/data"
        onChange={(event) => onPatch({ url: event.target.value })}
        className="h-7 font-mono text-[11px]"
        aria-label="External URL"
      />
      <KvEditor
        rows={source.headers ?? {}}
        keyPlaceholder="Header"
        onChange={(headers) =>
          onPatch({ headers: Object.keys(headers).length > 0 ? headers : undefined })
        }
      />
      <Input
        value={(source.secretRefs ?? []).join(', ')}
        placeholder="Secret refs: {{vault:name}}, ..."
        onChange={(event) => {
          const refs = event.target.value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
          onPatch({ secretRefs: refs.length > 0 ? refs : undefined });
        }}
        className="h-7 font-mono text-[11px]"
        aria-label="Secret refs"
      />
    </div>
  );
}

function KvEditor({
  rows,
  keyPlaceholder,
  onChange,
}: {
  rows: Record<string, string>;
  keyPlaceholder: string;
  onChange: (rows: Record<string, string>) => void;
}): React.ReactNode {
  const entries = Object.entries(rows);
  return (
    <div className="flex flex-col gap-1">
      {entries.map(([key, value], index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={key}
            placeholder={keyPlaceholder}
            onChange={(event) => {
              const next = [...entries];
              next[index] = [event.target.value, value];
              onChange(Object.fromEntries(next));
            }}
            className="h-6 flex-1 font-mono text-[11px]"
          />
          <Input
            value={value}
            placeholder="Value"
            onChange={(event) => {
              const next = [...entries];
              next[index] = [key, event.target.value];
              onChange(Object.fromEntries(next));
            }}
            className="h-6 flex-1 font-mono text-[11px]"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove row"
            onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground"
        onClick={() => onChange({ ...rows, '': '' })}
      >
        <PlusIcon /> Add
      </Button>
    </div>
  );
}

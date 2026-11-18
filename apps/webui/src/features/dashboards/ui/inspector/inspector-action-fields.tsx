import type { Action, JsonValue, WidgetSource } from '@harnesys/contracts';
import { JsonValueSchema } from '@harnesys/contracts';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export type ActionType =
  | 'setState'
  | 'incrementState'
  | 'toggleState'
  | 'callApi'
  | 'refetchSource'
  | 'invokeExternal'
  | 'navigate'
  | 'notify'
  | 'sequence';

export const ACTION_TYPES: ActionType[] = [
  'setState',
  'incrementState',
  'toggleState',
  'callApi',
  'refetchSource',
  'invokeExternal',
  'navigate',
  'notify',
  'sequence',
];

export const ACTION_LABELS: Record<ActionType, string> = {
  setState: 'Set state',
  incrementState: 'Increment state',
  toggleState: 'Toggle state',
  callApi: 'Call org API',
  refetchSource: 'Refetch source',
  invokeExternal: 'Invoke source',
  navigate: 'Navigate',
  notify: 'Notify',
  sequence: 'Sequence',
};

export function isActionType(value: string): value is ActionType {
  return (ACTION_TYPES as string[]).includes(value);
}

export function defaultAction(
  type: ActionType,
  firstStateKey: string | undefined,
  sources: WidgetSource[],
  orgId: string,
): Action {
  const firstSourceId = sources[0]?.id ?? '';
  const firstExternalId = sources.find((source) => source.kind === 'external')?.id ?? firstSourceId;
  switch (type) {
    case 'incrementState':
      return { type, key: firstStateKey ?? 'count', delta: 1 };
    case 'setState':
      return { type, key: firstStateKey ?? 'count', value: 0 };
    case 'toggleState':
      return { type, key: firstStateKey ?? 'flag' };
    case 'callApi':
      return { type, method: 'POST', path: `/orgs/${orgId}/` };
    case 'refetchSource':
      return { type, sourceId: firstSourceId };
    case 'invokeExternal':
      return { type, sourceId: firstExternalId };
    case 'navigate':
      return { type, to: `/o/${orgId}/` };
    case 'notify':
      return { type, message: 'Done', level: 'info' };
    case 'sequence':
      return { type, actions: [{ type: 'notify', message: 'Done', level: 'info' }] };
  }
}

export function SourcePicker({
  label,
  sourceId,
  sources,
  onChange,
}: {
  label: string;
  sourceId: string;
  sources: WidgetSource[];
  onChange: (sourceId: string) => void;
}): React.ReactNode {
  return (
    <Row label={label}>
      <Select value={sourceId} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger size="sm" className="flex-1" aria-label={label}>
          <SelectValue placeholder="Pick source" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}

export function ExprRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <Row label={label}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 flex-1 font-mono text-[11px]"
        aria-label={label}
      />
    </Row>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function exprText(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

export function parseJsonOrText(raw: string): JsonValue {
  try {
    const parsed = JsonValueSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : raw;
  } catch {
    return raw;
  }
}

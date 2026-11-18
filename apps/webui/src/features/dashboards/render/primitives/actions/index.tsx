import type { LucideIcon } from 'lucide-react';
import { MousePointerClickIcon as ActionsLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { use, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { WidgetRuntimeContext } from '../../runtime-context';
import { asArray, asRecord, asString } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState, WidgetErrorState } from '../states';

export const ActionsIcon: LucideIcon = ActionsLucideIcon;

export type WidgetActionSpec =
  | {
      type: 'orgApi';
      path: string;
      method?: string;
      query?: Record<string, string>;
      body?: unknown;
    }
  | { type: 'external'; sourceId: string };

export interface WidgetActionDef {
  label: string;
  action: WidgetActionSpec;
  /** Two-step inline confirmation before executing. */
  confirm?: boolean;
  successMessage?: string;
}

function optionalText(value: unknown): string | undefined {
  const text = asString(value);
  return text === undefined || text === '' ? undefined : text;
}

/** Query values are scalars only; anything else is dropped instead of stringified. */
function queryOf(raw: unknown): Record<string, string> | undefined {
  const record = asRecord(raw);
  if (!record) {
    return undefined;
  }
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      query[key] = String(value);
    }
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

/** Malformed entries (no label, unknown type, missing target) drop out silently. */
function parseActions(raw: unknown): WidgetActionDef[] {
  return asArray(raw).flatMap((item): WidgetActionDef[] => {
    const record = asRecord(item);
    const action = record ? asRecord(record.action) : undefined;
    const label = record ? asString(record.label) : undefined;
    const type = action ? asString(action.type) : undefined;
    if (!record || !action || !label) {
      return [];
    }
    if (type === 'orgApi' && typeof action.path === 'string' && action.path !== '') {
      return [
        {
          label,
          action: {
            type: 'orgApi',
            path: action.path,
            method: optionalText(action.method),
            query: queryOf(action.query),
            body: action.body,
          },
          confirm: record.confirm === true,
          successMessage: optionalText(record.successMessage),
        },
      ];
    }
    if (type === 'external' && typeof action.sourceId === 'string' && action.sourceId !== '') {
      return [
        {
          label,
          action: { type: 'external', sourceId: action.sourceId },
          confirm: record.confirm === true,
          successMessage: optionalText(record.successMessage),
        },
      ];
    }
    return [];
  });
}

/** Buttons executing org API calls or external invokes through the widget runtime. */
export function ActionsPrimitive({ props }: PrimitiveComponentProps): ReactNode {
  const runtime = use(WidgetRuntimeContext);
  const buttons = parseActions(props.buttons);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  if (!runtime) {
    return (
      <WidgetErrorState
        title="Runtime unavailable"
        message="Actions require the widget runtime context."
      />
    );
  }
  if (buttons.length === 0) {
    return <WidgetEmptyState message="No actions configured" />;
  }

  const execute = async (def: WidgetActionSpec, index: number): Promise<void> => {
    setPendingIndex(index);
    try {
      if (def.type === 'orgApi') {
        await runtime.orgApi({
          path: def.path,
          method: def.method,
          query: def.query,
          body: def.body,
        });
      } else {
        await runtime.invokeExternal(def.sourceId);
      }
      toast.add({ title: buttons[index]?.successMessage ?? 'Action completed', type: 'success' });
    } catch (error) {
      toast.add({
        title: 'Action failed',
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setPendingIndex(null);
      setConfirmIndex(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-wrap content-start items-start gap-2 p-1">
      {buttons.map((def, index) => {
        const key = `${index}-${def.label}`;
        if (confirmIndex === index) {
          return (
            <span key={key} className="flex items-center gap-1.5">
              <Button
                size="xs"
                disabled={pendingIndex === index}
                onClick={() => void execute(def.action, index)}
              >
                Confirm
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirmIndex(null)}>
                Cancel
              </Button>
            </span>
          );
        }
        return (
          <Button
            key={key}
            variant="outline"
            size="xs"
            disabled={pendingIndex !== null}
            onClick={() => {
              if (def.confirm) {
                setConfirmIndex(index);
                return;
              }
              void execute(def.action, index);
            }}
          >
            {pendingIndex === index ? 'Running...' : def.label}
          </Button>
        );
      })}
    </div>
  );
}

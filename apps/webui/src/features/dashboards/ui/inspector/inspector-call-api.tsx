import type { Action, Expr } from '@harnesys/contracts';
import { JsonValueSchema } from '@harnesys/contracts';
import { useId } from 'react';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { ExprRow, exprText, parseJsonOrText, Row } from './inspector-action-fields';

type CallApiAction = Extract<Action, { type: 'callApi' }>;

type ConfirmMode = 'auto' | 'always' | 'never' | 'message';

function confirmMode(confirm: boolean | string | undefined): ConfirmMode {
  if (confirm === undefined) {
    return 'auto';
  }
  if (typeof confirm === 'string') {
    return 'message';
  }
  return confirm ? 'always' : 'never';
}

interface OptionalExprAreaProps {
  label: string;
  value: Expr | undefined;
  onChange: (value: Expr | undefined) => void;
}

function OptionalExprArea({ label, value, onChange }: OptionalExprAreaProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Textarea
        value={value === undefined ? '' : exprText(value)}
        placeholder='{"key": "value"}'
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.trim() === '') {
            onChange(undefined);
            return;
          }
          const parsed = parseJsonOrText(raw);
          const json = JsonValueSchema.safeParse(parsed);
          if (json.success) {
            onChange(json.data);
          }
        }}
        className="min-h-14 font-mono text-[11px]"
        aria-label={label}
      />
    </div>
  );
}

interface CallApiFieldsProps {
  action: CallApiAction;
  stateKeys: string[];
  onChange: (action: Action | undefined) => void;
}

/** `callApi` action fields: request, confirmation, result sink and messages. */
export function CallApiFields({
  action,
  stateKeys,
  onChange,
}: CallApiFieldsProps): React.ReactNode {
  const listId = useId();
  const confirm = confirmMode(action.confirm);
  const setConfirm = (mode: string): void => {
    if (mode === 'auto') {
      onChange({ ...action, confirm: undefined });
      return;
    }
    if (mode === 'always') {
      onChange({ ...action, confirm: true });
      return;
    }
    if (mode === 'never') {
      onChange({ ...action, confirm: false });
      return;
    }
    if (mode === 'message') {
      const message = typeof action.confirm === 'string' ? action.confirm : 'Run this action?';
      onChange({ ...action, confirm: message });
    }
  };
  return (
    <>
      <datalist id={listId}>
        {stateKeys.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
      <Row label="Method">
        <Select
          value={action.method}
          onValueChange={(method) =>
            method && onChange({ ...action, method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' })
          }
        >
          <SelectTrigger size="sm" className="w-24" aria-label="Action method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['GET', 'POST', 'PUT', 'PATCH'] as const).map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <ExprRow
        label="Path"
        value={exprText(action.path)}
        onChange={(value) => onChange({ ...action, path: parseJsonOrText(value) })}
      />
      <OptionalExprArea
        label="Query"
        value={action.query}
        onChange={(query) => onChange({ ...action, query })}
      />
      <OptionalExprArea
        label="Body"
        value={action.body}
        onChange={(body) => onChange({ ...action, body })}
      />
      <Row label="Result to">
        <Input
          value={action.resultTo ?? ''}
          list={listId}
          placeholder="state key (optional)"
          onChange={(event) =>
            onChange({
              ...action,
              resultTo: event.target.value === '' ? undefined : event.target.value,
            })
          }
          className="h-6 flex-1 font-mono text-[11px]"
          aria-label="Result state key"
        />
      </Row>
      <Row label="Confirm">
        <Select value={confirm} onValueChange={(mode) => mode && setConfirm(mode)}>
          <SelectTrigger size="sm" className="w-28" aria-label="Confirm mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="always">Always</SelectItem>
            <SelectItem value="never">Never</SelectItem>
            <SelectItem value="message">Message</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      {typeof action.confirm === 'string' ? (
        <Row label="Prompt">
          <Input
            value={action.confirm}
            onChange={(event) => onChange({ ...action, confirm: event.target.value || undefined })}
            className="h-6 flex-1"
            aria-label="Confirm message"
          />
        </Row>
      ) : null}
      <Row label="On success">
        <Input
          value={action.successMessage ?? ''}
          placeholder="Message (optional)"
          onChange={(event) =>
            onChange({ ...action, successMessage: event.target.value || undefined })
          }
          className="h-6 flex-1"
          aria-label="Success message"
        />
      </Row>
    </>
  );
}

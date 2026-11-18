import type { Action, ActionList, WidgetSource } from '@harnesys/contracts';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  ACTION_LABELS,
  ACTION_TYPES,
  defaultAction,
  ExprRow,
  exprText,
  isActionType,
  parseJsonOrText,
  Row,
  SourcePicker,
} from './inspector-action-fields';
import { CallApiFields } from './inspector-call-api';

function toActions(actionList: ActionList | undefined): Action[] {
  if (actionList === undefined) {
    return [];
  }
  return Array.isArray(actionList) ? actionList : [actionList];
}

interface ActionEditorProps {
  action: Action | undefined;
  sources: WidgetSource[];
  stateKeys: string[];
  orgId: string;
  onChange: (action: Action | undefined) => void;
}

/** Single action editor: type picker plus the fields of the picked variant. */
export function ActionEditor({
  action,
  sources,
  stateKeys,
  orgId,
  onChange,
}: ActionEditorProps): React.ReactNode {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2">
      <Row label="Type">
        <Select
          value={action?.type ?? 'none'}
          onValueChange={(value) => {
            if (!value) {
              return;
            }
            if (value === 'none') {
              onChange(undefined);
              return;
            }
            if (isActionType(value)) {
              onChange(defaultAction(value, stateKeys[0], sources, orgId));
            }
          }}
        >
          <SelectTrigger size="sm" className="flex-1" aria-label="Action type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No action</SelectItem>
            {ACTION_TYPES.map((option) => (
              <SelectItem key={option} value={option}>
                {ACTION_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {action ? (
        <ActionFields
          action={action}
          sources={sources}
          stateKeys={stateKeys}
          orgId={orgId}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

interface ActionListEditorProps {
  actionList: ActionList | undefined;
  sources: WidgetSource[];
  stateKeys: string[];
  orgId: string;
  onChange: (actionList: ActionList | undefined) => void;
}

/** Event handler editor: one action stays a single Action, several become a list. */
export function ActionListEditor({
  actionList,
  sources,
  stateKeys,
  orgId,
  onChange,
}: ActionListEditorProps): React.ReactNode {
  const actions = toActions(actionList);
  const commit = (next: Action[]): void => {
    const [first, ...rest] = next;
    if (!first) {
      onChange(undefined);
      return;
    }
    onChange(rest.length === 0 ? first : next);
  };
  const replace = (index: number, next: Action | undefined): void => {
    if (!next) {
      commit(actions.filter((_, actionIndex) => actionIndex !== index));
      return;
    }
    commit(actions.map((entry, actionIndex) => (actionIndex === index ? next : entry)));
  };
  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((action, index) => (
        <div key={index} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <ActionEditor
              action={action}
              sources={sources}
              stateKeys={stateKeys}
              orgId={orgId}
              onChange={(next) => replace(index, next)}
            />
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove action"
            onClick={() => replace(index, undefined)}
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit text-muted-foreground"
        onClick={() =>
          commit([...actions, defaultAction('setState', stateKeys[0], sources, orgId)])
        }
      >
        <PlusIcon /> Add action
      </Button>
    </div>
  );
}

interface ActionFieldsProps {
  action: Action;
  sources: WidgetSource[];
  stateKeys: string[];
  orgId: string;
  onChange: (action: Action | undefined) => void;
}

function ActionFields({
  action,
  sources,
  stateKeys,
  orgId,
  onChange,
}: ActionFieldsProps): React.ReactNode {
  return (
    <>
      {action.type === 'callApi' ? (
        <CallApiFields action={action} stateKeys={stateKeys} onChange={onChange} />
      ) : null}
      {action.type === 'callApi' ? (
        <>
          <NestedActions
            label="On success"
            actions={action.onSuccess}
            sources={sources}
            stateKeys={stateKeys}
            orgId={orgId}
            onChange={(next) => onChange({ ...action, onSuccess: next })}
          />
          <NestedActions
            label="On error"
            actions={action.onError}
            sources={sources}
            stateKeys={stateKeys}
            orgId={orgId}
            onChange={(next) => onChange({ ...action, onError: next })}
          />
        </>
      ) : null}
      {action.type === 'refetchSource' ? (
        <SourcePicker
          label="Source"
          sourceId={action.sourceId}
          sources={sources}
          onChange={(sourceId) => onChange({ ...action, sourceId })}
        />
      ) : null}
      {action.type === 'invokeExternal' ? (
        <>
          <SourcePicker
            label="Source"
            sourceId={action.sourceId}
            sources={sources.filter((source) => source.kind === 'external')}
            onChange={(sourceId) => onChange({ ...action, sourceId })}
          />
          <ExprRow
            label="Result to"
            value={action.resultTo ?? ''}
            onChange={(value) =>
              onChange({ ...action, resultTo: value === '' ? undefined : value })
            }
          />
        </>
      ) : null}
      {action.type === 'setState' ||
      action.type === 'incrementState' ||
      action.type === 'toggleState' ? (
        <Row label="State key">
          <Input
            value={action.key}
            placeholder="count"
            onChange={(event) => onChange({ ...action, key: event.target.value })}
            className="h-6 flex-1 font-mono text-[11px]"
            aria-label="State key"
          />
        </Row>
      ) : null}
      {action.type === 'incrementState' ? (
        <ExprRow
          label="Delta"
          value={exprText(action.delta)}
          onChange={(value) => onChange({ ...action, delta: parseJsonOrText(value) })}
        />
      ) : null}
      {action.type === 'setState' ? (
        <ExprRow
          label="Value"
          value={exprText(action.value)}
          onChange={(value) => onChange({ ...action, value: parseJsonOrText(value) })}
        />
      ) : null}
      {action.type === 'navigate' ? (
        <ExprRow
          label="To"
          value={exprText(action.to)}
          onChange={(value) => onChange({ ...action, to: parseJsonOrText(value) })}
        />
      ) : null}
      {action.type === 'notify' ? (
        <>
          <ExprRow
            label="Message"
            value={exprText(action.message)}
            onChange={(value) => onChange({ ...action, message: parseJsonOrText(value) })}
          />
          <Row label="Level">
            <Select
              value={action.level}
              onValueChange={(level) => {
                if (level === 'info' || level === 'success' || level === 'error') {
                  onChange({ ...action, level });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-28" aria-label="Notify level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['info', 'success', 'error'] as const).map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </>
      ) : null}
      {action.type === 'sequence' ? (
        <ActionListEditor
          actionList={action.actions}
          sources={sources}
          stateKeys={stateKeys}
          orgId={orgId}
          onChange={(next) => {
            const actions = toActions(next);
            onChange(actions.length > 0 ? { ...action, actions } : undefined);
          }}
        />
      ) : null}
    </>
  );
}

function NestedActions({
  label,
  actions,
  sources,
  stateKeys,
  orgId,
  onChange,
}: {
  label: string;
  actions: Action[] | undefined;
  sources: WidgetSource[];
  stateKeys: string[];
  orgId: string;
  onChange: (actions: Action[] | undefined) => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-1 border-border/50 border-t pt-1.5">
      <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <ActionListEditor
        actionList={actions}
        sources={sources}
        stateKeys={stateKeys}
        orgId={orgId}
        onChange={(next) => {
          const list = toActions(next);
          onChange(list.length > 0 ? list : undefined);
        }}
      />
    </div>
  );
}

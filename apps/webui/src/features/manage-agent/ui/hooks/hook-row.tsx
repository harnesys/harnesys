import type {
  AgentHook,
  AgentHookEvent,
  HookHandlerSpec,
  HookHandlerType,
} from '@harnesys/contracts';
import type { HookEventPhase } from 'harnesys/domain';
import { BotIcon, GlobeIcon, PlugIcon, SparklesIcon, TerminalIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowSection } from '@/shared/ui/capability-rows';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { HOOK_EVENT_CATALOG, HOOK_PHASE_LABELS, hookEventDescription } from './hook-catalog';
import {
  defaultHandler,
  HookHandlerEditor,
  HookHandlerTypeSelect,
  type UiHandlerType,
} from './hook-handler-editor';
import { HookTestPanel } from './hook-test-panel';

export interface HookGateInfo {
  status: 'granted' | 'denied';
  reason?: string;
}

const HANDLER_ICONS: Record<HookHandlerType, typeof TerminalIcon> = {
  command: TerminalIcon,
  http: GlobeIcon,
  mcp_tool: PlugIcon,
  prompt: SparklesIcon,
  agent: BotIcon,
};

const HANDLER_LABELS: Record<HookHandlerType, string> = {
  command: 'command',
  http: 'http',
  mcp_tool: 'mcp',
  prompt: 'prompt',
  agent: 'agent',
};

export function HookRow({
  hook,
  gate,
  orgId,
  agentId,
  mcpServers,
  agentIds,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  hook: AgentHook;
  gate: HookGateInfo;
  orgId: string;
  agentId: string;
  mcpServers: string[];
  agentIds: string[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (hook: AgentHook) => void;
  onRemove: () => void;
}) {
  const disabled = hook.enabled === false;
  const Icon = HANDLER_ICONS[hook.handler.type];
  const title = eventTitle(hook.event);
  return (
    <Row
      testId={`agent-hook-${hook.id ?? hook.event}`}
      icon={<Icon />}
      title={title}
      mono={false}
      meta={hook.event}
      chips={
        <>
          <RowChip tone="neutral">{HANDLER_LABELS[hook.handler.type]}</RowChip>
          {disabled ? <RowChip tone="warn">disabled</RowChip> : null}
          {gate.status === 'denied' ? <RowChip tone="danger">blocked</RowChip> : null}
        </>
      }
      summary={expanded ? undefined : hookSummary(hook)}
      onToggle={onToggle}
      expanded={expanded}
      actions={
        <>
          <Switch
            size="sm"
            checked={!disabled}
            aria-label={`Toggle ${title}`}
            onCheckedChange={(checked: boolean) => onChange({ ...hook, enabled: checked })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${title}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </>
      }
    >
      <RowSection label="Trigger">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">{hookEventDescription(hook.event)}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="hook-event">Event</FieldLabel>
              <EventSelect value={hook.event} onChange={(event) => onChange({ ...hook, event })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="hook-matcher">Matcher</FieldLabel>
              <Input
                id="hook-matcher"
                className="font-mono text-xs"
                placeholder="tool name (optional)"
                value={hook.matcher ?? ''}
                onChange={(event) => onChange({ ...hook, matcher: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="hook-timeout">Timeout (seconds)</FieldLabel>
              <Input
                id="hook-timeout"
                className="font-mono text-xs"
                placeholder="default"
                value={hook.timeoutS === undefined ? '' : String(hook.timeoutS)}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  onChange({
                    ...hook,
                    timeoutS: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
                  });
                }}
              />
            </Field>
          </div>
          {gate.status === 'denied' ? (
            <p className="text-destructive text-xs">
              {gate.reason ?? 'This hook cannot run with the current permissions of the agent.'}
            </p>
          ) : null}
        </div>
      </RowSection>
      <RowSection label="Handler">
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="hook-handler-type">Type</FieldLabel>
            <HookHandlerTypeSelect
              value={hook.handler.type}
              onChange={(type: UiHandlerType) =>
                onChange({ ...hook, handler: defaultHandler(type) })
              }
            />
          </Field>
          <HookHandlerEditor
            handler={hook.handler}
            mcpServers={mcpServers}
            agentIds={agentIds}
            onChange={(handler) => onChange({ ...hook, handler })}
          />
        </div>
      </RowSection>
      <HookTestPanel orgId={orgId} agentId={agentId} hook={hook} />
    </Row>
  );
}

function eventTitle(event: AgentHookEvent): string {
  const entry = HOOK_EVENT_CATALOG.find((item) => item.event === event);
  return entry === undefined ? event : entry.label;
}

function hookSummary(hook: AgentHook): string {
  const matcher = hook.matcher === undefined || hook.matcher === '' ? 'any' : hook.matcher;
  return `${HOOK_PHASE_LABELS[eventPhase(hook.event)]} · ${matcher} · ${handlerSummary(hook.handler)}`;
}

function eventPhase(event: AgentHookEvent): HookEventPhase {
  const entry = HOOK_EVENT_CATALOG.find((item) => item.event === event);
  return entry === undefined ? 'session' : entry.phase;
}

function handlerSummary(handler: HookHandlerSpec): string {
  switch (handler.type) {
    case 'command':
      return handler.command === '' ? 'empty command' : handler.command;
    case 'http':
      return handler.url === '' ? 'empty url' : handler.url;
    case 'mcp_tool':
      return `${handler.server}__${handler.tool}`;
    case 'prompt':
      return handler.prompt === '' ? 'empty prompt' : handler.prompt;
    case 'agent':
      return `→ ${handler.agentId === undefined || handler.agentId === '' ? 'no agent' : handler.agentId}`;
  }
}

function EventSelect({
  value,
  onChange,
}: {
  value: AgentHookEvent;
  onChange: (event: AgentHookEvent) => void;
}) {
  const items = HOOK_EVENT_CATALOG.map((entry) => ({
    value: entry.event,
    label: `${HOOK_PHASE_LABELS[entry.phase]} · ${entry.label}`,
  }));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null && isHookEvent(next)) {
          onChange(next);
        }
      }}
    >
      <SelectTrigger id="hook-event" className="w-full text-xs" aria-label="Hook event">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="text-xs">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function isHookEvent(value: string): value is AgentHookEvent {
  return HOOK_EVENT_CATALOG.some((entry) => entry.event === value);
}

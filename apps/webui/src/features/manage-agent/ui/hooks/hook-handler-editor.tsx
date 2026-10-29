import type { AgentHook, HookHandlerSpec, HookHandlerType } from '@harnesys/contracts';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

export const HOOK_HANDLER_TYPES = ['command', 'http', 'mcp_tool', 'prompt', 'agent'] as const;
export type UiHandlerType = (typeof HOOK_HANDLER_TYPES)[number];

export const HOOK_HANDLER_TYPE_LABELS: Record<UiHandlerType, string> = {
  command: 'Run command',
  http: 'Call url',
  mcp_tool: 'Call MCP tool',
  prompt: 'Ask the model',
  agent: 'Delegate to agent',
};

const SHELL_OPTIONS = [
  { value: 'none', label: 'Direct (no shell)' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
] as const;

const SHELL_METACHARS = /[|&;<>$`*?()[\]{}\\]/;

function needsShell(command: string): boolean {
  return SHELL_METACHARS.test(command);
}

export function isUiHandlerType(value: string): value is UiHandlerType {
  return (HOOK_HANDLER_TYPES as readonly string[]).includes(value);
}

export function defaultHandler(type: UiHandlerType): HookHandlerSpec {
  switch (type) {
    case 'command':
      return { type: 'command', command: '' };
    case 'http':
      return { type: 'http', url: '' };
    case 'mcp_tool':
      return { type: 'mcp_tool', server: '', tool: '' };
    case 'prompt':
      return { type: 'prompt', prompt: '' };
    case 'agent':
      return { type: 'agent', prompt: '' };
  }
}

export function HookHandlerEditor({
  handler,
  mcpServers,
  agentIds,
  onChange,
}: {
  handler: HookHandlerSpec;
  mcpServers: string[];
  agentIds: string[];
  onChange: (handler: HookHandlerSpec) => void;
}) {
  if (handler.type === 'command') {
    const shell = handler.shell ?? 'none';
    return (
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="hook-command">Command</FieldLabel>
          <Input
            id="hook-command"
            className="font-mono text-xs"
            placeholder="./scripts/check.sh"
            value={handler.command}
            onChange={(event) => onChange({ ...handler, command: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="hook-shell">Shell</FieldLabel>
            <Select
              items={SHELL_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={shell}
              onValueChange={(next) => {
                if (next === 'none') {
                  onChange({ ...handler, shell: undefined });
                  return;
                }
                if (next === 'bash' || next === 'powershell') {
                  onChange({ ...handler, shell: next });
                }
              }}
            >
              <SelectTrigger id="hook-shell" className="w-full" aria-label="Shell">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHELL_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="hook-args">Arguments</FieldLabel>
            <Input
              id="hook-args"
              className="font-mono text-xs"
              placeholder="space separated (optional)"
              value={(handler.args ?? []).join(' ')}
              onChange={(event) => {
                const args = event.target.value.split(' ').filter((part) => part !== '');
                onChange({ ...handler, ...(args.length > 0 ? { args } : { args: undefined }) });
              }}
            />
          </Field>
        </div>
        {shell === 'none' && needsShell(handler.command) ? (
          <p className="text-destructive text-xs">
            This command uses shell syntax (pipes, redirects, quotes, ;). Pick Bash in the shell
            selector, otherwise the hook cannot be parsed.
          </p>
        ) : null}
        <Field>
          <FieldLabel htmlFor="hook-env">Environment</FieldLabel>
          <Textarea
            id="hook-env"
            className="font-mono text-xs"
            placeholder={'KEY=value per line\nsecret:NAME reads a vault secret'}
            value={envToText(handler.env)}
            onChange={(event) => onChange({ ...handler, env: textToEnv(event.target.value) })}
          />
        </Field>
      </div>
    );
  }
  if (handler.type === 'http') {
    return (
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="hook-url">URL</FieldLabel>
          <Input
            id="hook-url"
            className="font-mono text-xs"
            placeholder="https://example.com/hook"
            value={handler.url}
            onChange={(event) => onChange({ ...handler, url: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="hook-headers">Headers</FieldLabel>
          <Textarea
            id="hook-headers"
            className="font-mono text-xs"
            placeholder="KEY=value per line"
            value={envToText(handler.headers)}
            onChange={(event) => onChange({ ...handler, headers: textToEnv(event.target.value) })}
          />
        </Field>
      </div>
    );
  }
  if (handler.type === 'mcp_tool') {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="hook-mcp-server">MCP server</FieldLabel>
            <Select
              items={mcpServers.map((server) => ({ value: server, label: server }))}
              value={handler.server}
              onValueChange={(next) => {
                if (next !== null) {
                  onChange({ ...handler, server: next });
                }
              }}
            >
              <SelectTrigger id="hook-mcp-server" className="w-full" aria-label="MCP server">
                <SelectValue placeholder="MCP server" />
              </SelectTrigger>
              <SelectContent>
                {mcpServers.length === 0 ? (
                  <SelectItem value="__none">no MCP servers connected</SelectItem>
                ) : null}
                {mcpServers.map((server) => (
                  <SelectItem key={server} value={server}>
                    {server}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="hook-mcp-tool">Tool</FieldLabel>
            <Input
              id="hook-mcp-tool"
              className="font-mono text-xs"
              placeholder="read_file"
              value={handler.tool}
              onChange={(event) => onChange({ ...handler, tool: event.target.value })}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="hook-mcp-input">Input</FieldLabel>
          <Textarea
            id="hook-mcp-input"
            className="font-mono text-xs"
            placeholder="key=value per line"
            value={envToText(handler.input)}
            onChange={(event) => onChange({ ...handler, input: textToEnv(event.target.value) })}
          />
        </Field>
      </div>
    );
  }
  if (handler.type === 'prompt') {
    return (
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="hook-prompt">Instruction</FieldLabel>
          <Textarea
            id="hook-prompt"
            placeholder="What the model should add to the run"
            value={handler.prompt}
            onChange={(event) => onChange({ ...handler, prompt: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="hook-prompt-model">Model</FieldLabel>
          <Input
            id="hook-prompt-model"
            className="font-mono text-xs"
            placeholder="agent model (optional, provider/model)"
            value={handler.model ?? ''}
            onChange={(event) =>
              onChange({
                ...handler,
                model: event.target.value === '' ? undefined : event.target.value,
              })
            }
          />
        </Field>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="hook-agent">Target agent</FieldLabel>
        <Select
          items={agentIds.map((id) => ({ value: id, label: id }))}
          value={handler.agentId ?? ''}
          onValueChange={(next) => {
            if (next !== null) {
              onChange({ ...handler, agentId: next });
            }
          }}
        >
          <SelectTrigger id="hook-agent" className="w-full" aria-label="Target agent">
            <SelectValue placeholder="Target agent" />
          </SelectTrigger>
          <SelectContent>
            {agentIds.length === 0 ? (
              <SelectItem value="__none">no other agents in this org</SelectItem>
            ) : null}
            {agentIds.map((id) => (
              <SelectItem key={id} value={id}>
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="hook-agent-prompt">Task</FieldLabel>
        <Textarea
          id="hook-agent-prompt"
          placeholder="What the target agent should do"
          value={handler.prompt}
          onChange={(event) => onChange({ ...handler, prompt: event.target.value })}
        />
      </Field>
    </div>
  );
}

export function HookHandlerTypeSelect({
  value,
  onChange,
}: {
  value: HookHandlerType;
  onChange: (type: UiHandlerType) => void;
}) {
  return (
    <Select
      items={HOOK_HANDLER_TYPES.map((type) => ({
        value: type,
        label: HOOK_HANDLER_TYPE_LABELS[type],
      }))}
      value={value}
      onValueChange={(next) => {
        if (next !== null && isUiHandlerType(next)) {
          onChange(next);
        }
      }}
    >
      <SelectTrigger id="hook-handler-type" className="w-48" aria-label="Hook handler type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HOOK_HANDLER_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {HOOK_HANDLER_TYPE_LABELS[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function newHook(): AgentHook {
  return {
    id: crypto.randomUUID(),
    event: 'PreToolUse',
    handler: { type: 'command', command: '' },
  };
}

function envToText(env: Record<string, string> | undefined): string {
  return Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function textToEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

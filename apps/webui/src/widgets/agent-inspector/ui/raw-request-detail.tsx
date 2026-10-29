import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { CopyIconButton } from './copy-icon-button';
import { FactRow } from './fact-row';
import { copyText, stringifyJson } from './raw-request-format';

interface RawRequestSetting {
  label: string;
  value: string;
}

interface RawToolCall {
  key: string;
  name: string;
  arguments: string;
}

interface RawMessage {
  key: string;
  role: string;
  content: string;
  reasoning: string;
  toolCallId: string;
  toolCalls: RawToolCall[];
}

interface RawTool {
  key: string;
  name: string;
  type: string;
  description: string;
  parameters: unknown;
}

const SETTING_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'max_tokens', label: 'Max tokens' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'top_p', label: 'Top P' },
  { key: 'frequency_penalty', label: 'Freq penalty' },
  { key: 'presence_penalty', label: 'Pres penalty' },
  { key: 'reasoning_effort', label: 'Reasoning' },
  { key: 'tool_choice', label: 'Tool choice' },
  { key: 'stream', label: 'Stream' },
];

export function RawRequestDetail({ body }: { body: unknown }) {
  const record = asRecord(body);
  const model = textValue(record.model);
  const settings = readSettings(record);
  const messages = toMessages(record.messages);
  const tools = toTools(record.tools);
  return (
    <div className="flex flex-col gap-3">
      {model ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] text-muted-foreground/70 uppercase tracking-[0.12em]">
            Model
          </span>
          <p className="break-all font-mono text-[11px] leading-snug" title={model}>
            {model}
          </p>
        </div>
      ) : null}

      {settings.length > 0 ? (
        <div className="flex flex-col">
          {settings.map((setting) => (
            <FactRow key={setting.label} label={setting.label} mono>
              {setting.value}
            </FactRow>
          ))}
        </div>
      ) : null}

      {messages.length > 0 ? (
        <RequestGroup label="Messages" count={messages.length}>
          {messages.map((message) => (
            <MessageRow key={message.key} message={message} />
          ))}
        </RequestGroup>
      ) : null}

      {tools.length > 0 ? (
        <RequestGroup label="Tools" count={tools.length} defaultOpen={false}>
          {tools.map((tool) => (
            <ToolRow key={tool.key} tool={tool} />
          ))}
        </RequestGroup>
      ) : null}

      <RawJsonBlock body={body} />
    </div>
  );
}

function readSettings(record: Record<string, unknown>): RawRequestSetting[] {
  const settings: RawRequestSetting[] = [];
  for (const field of SETTING_FIELDS) {
    const value = record[field.key];
    if (value !== undefined && value !== null) {
      settings.push({ label: field.label, value: formatValue(value) });
    }
  }
  return settings;
}

function toMessages(value: unknown): RawMessage[] {
  return asArray(value).map((entry, index) => {
    const record = asRecord(entry);
    return {
      key: `message-${index}`,
      role: textValue(record.role) || 'message',
      content: textValue(record.content),
      reasoning: textValue(record.reasoning_content),
      toolCallId: textValue(record.tool_call_id),
      toolCalls: asArray(record.tool_calls).map((call, callIndex) => {
        const fn = asRecord(asRecord(call).function);
        return {
          key: `call-${callIndex}`,
          name: textValue(fn.name),
          arguments: textValue(fn.arguments),
        };
      }),
    };
  });
}

function toTools(value: unknown): RawTool[] {
  return asArray(value).map((entry, index) => {
    const record = asRecord(entry);
    const fn = asRecord(record.function);
    return {
      key: `tool-${index}`,
      name: textValue(fn.name),
      type: textValue(record.type),
      description: textValue(fn.description),
      parameters: fn.parameters,
    };
  });
}

function MessageRow({ message }: { message: RawMessage }) {
  const toolLabel =
    message.toolCalls.length === 1 ? '1 tool call' : `${message.toolCalls.length} tool calls`;
  const preview =
    message.content ||
    message.toolCallId ||
    message.reasoning ||
    (message.toolCalls.length > 0 ? toolLabel : '');
  const expandable = Boolean(preview);
  const head = (
    <>
      <ChevronRightIcon
        className={
          expandable
            ? 'size-3 shrink-0 text-muted-foreground/50 transition-transform group-data-[panel-open]/message:rotate-90'
            : 'size-3 shrink-0 text-transparent'
        }
      />
      <span className="shrink-0 rounded bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
        {message.role}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
        {preview || 'empty message'}
      </span>
    </>
  );
  if (!expandable) {
    return <div className="flex items-center gap-1.5 px-1.5 py-1">{head}</div>;
  }
  return (
    <Collapsible className="group/msg relative rounded-md hover:bg-muted/40">
      <CollapsibleTrigger className="group/message flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40">
        {head}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CopyIconButton
          label="Copy message"
          className="absolute top-8 right-1 z-10 opacity-0 transition-opacity group-hover/msg:opacity-100"
          onCopy={() => copyText(messageCopyText(message))}
        />
        <div className="flex flex-col gap-1.5 pt-1 pb-1.5 pl-6">
          {message.reasoning ? (
            <LabeledBlock label="reasoning">
              <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground leading-relaxed">
                {message.reasoning}
              </pre>
            </LabeledBlock>
          ) : null}
          {message.content ? <RequestPre text={message.content} /> : null}
          {message.toolCallId ? (
            <p className="truncate font-mono text-[9px] text-muted-foreground/70">
              tool_call_id: {message.toolCallId}
            </p>
          ) : null}
          {message.toolCalls.map((call) => (
            <div
              key={call.key}
              className="flex flex-col gap-0.5 rounded-md border border-border/50 px-2 py-1"
            >
              <span className="truncate font-mono text-[10px]">{call.name}</span>
              <RequestPre text={call.arguments} />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function messageCopyText(message: RawMessage): string {
  const parts: string[] = [`${message.role}:`];
  if (message.reasoning) {
    parts.push(message.reasoning);
  }
  if (message.content) {
    parts.push(message.content);
  }
  if (message.toolCallId) {
    parts.push(`tool_call_id: ${message.toolCallId}`);
  }
  for (const call of message.toolCalls) {
    parts.push(`${call.name}(${call.arguments})`);
  }
  return parts.join('\n');
}

function ToolRow({ tool }: { tool: RawTool }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group/tool flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40">
        <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/50 transition-transform group-data-[panel-open]/tool:rotate-90" />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{tool.name}</span>
        {tool.type ? (
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70 uppercase tracking-wide">
            {tool.type}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 pt-1 pb-1.5 pl-6">
          {tool.description ? (
            <p className="text-[10px] text-muted-foreground leading-snug">{tool.description}</p>
          ) : null}
          {tool.parameters !== undefined ? (
            <RequestPre text={stringifyJson(tool.parameters)} />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RawJsonBlock({ body }: { body: unknown }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group/raw flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40">
        <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/50 transition-transform group-data-[panel-open]/raw:rotate-90" />
        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
          Raw JSON
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
          {stringifyJson(body)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RequestGroup({
  label,
  count,
  defaultOpen = true,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="flex flex-col gap-0.5">
      <CollapsibleTrigger className="group/group flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted/40">
        <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/50 transition-transform group-data-[panel-open]/group:rotate-90" />
        <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">{count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function LabeledBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] text-muted-foreground/70 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

function RequestPre({ text }: { text: string }) {
  return (
    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-1.5 font-mono text-[10px] text-foreground/90 leading-relaxed">
      {text}
    </pre>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  return formatValue(value);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return stringifyJson(value);
}

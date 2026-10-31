import type { GraphRoute, Node, ToolCallBatch } from 'harnesys';
import { PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { ConcurrencyField, concurrencyString } from './agent-graph-concurrency-field';
import { ControlNodeFields } from './agent-graph-control-fields';
import { GraphInput } from './agent-graph-input';
import { NodeModelFields } from './agent-graph-node-model-fields';
export interface AgentGraphNodeFieldsProps {
  id: string;
  node: Node;
  onChangeId: (nextId: string) => void;
  onChange: (node: Node) => void;
  agentModelId?: string | null;
  primaryNodeId?: string;
  onPrimaryChange?: (id: string | undefined) => void;
}
export function AgentGraphNodeFields({
  id,
  node,
  onChangeId,
  onChange,
  agentModelId,
  primaryNodeId,
  onPrimaryChange,
}: AgentGraphNodeFieldsProps) {
  return (
    <FieldGroup className="gap-2">
      <Field>
        <FieldLabel htmlFor="graph-node-id" className="text-[11px]">
          Id
        </FieldLabel>
        <GraphInput
          id="graph-node-id"
          value={id}
          onChange={(event) => onChangeId(event.target.value)}
          className="font-mono"
        />
      </Field>
      <NodeTypeFields
        id={id}
        node={node}
        onChange={onChange}
        agentModelId={agentModelId}
        primaryNodeId={primaryNodeId}
        onPrimaryChange={onPrimaryChange}
      />
    </FieldGroup>
  );
}
function NodeTypeFields({
  id,
  node,
  onChange,
  agentModelId,
  primaryNodeId,
  onPrimaryChange,
}: {
  id: string;
  node: Node;
  onChange: (node: Node) => void;
  agentModelId?: string | null;
  primaryNodeId?: string;
  onPrimaryChange?: (id: string | undefined) => void;
}) {
  switch (node.type) {
    case 'core:start':
      return <p className="text-[11px] text-muted-foreground">Start has no configurable fields.</p>;
    case 'core:end':
      return (
        <Field>
          <FieldLabel htmlFor="graph-end-output">Output (expr)</FieldLabel>
          <GraphInput
            id="graph-end-output"
            value={typeof node.output === 'string' ? node.output : ''}
            placeholder="optional"
            onChange={(event) => {
              const value = event.target.value;
              onChange(value === '' ? { type: 'core:end' } : { type: 'core:end', output: value });
            }}
          />
        </Field>
      );
    case 'llm:generate':
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-llm-prompt">Prompt</FieldLabel>
            <GraphInput
              id="graph-llm-prompt"
              value={node.prompt}
              onChange={(event) => onChange({ ...node, prompt: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-llm-messages">Messages (expr)</FieldLabel>
            <GraphInput
              id="graph-llm-messages"
              value={typeof node.messages === 'string' ? node.messages : ''}
              onChange={(event) => {
                const value = event.target.value;
                onChange(
                  value === ''
                    ? {
                        type: 'llm:generate',
                        prompt: node.prompt,
                        ...(node.model !== undefined ? { model: node.model } : {}),
                        tools: node.tools,
                      }
                    : {
                        type: 'llm:generate',
                        prompt: node.prompt,
                        messages: value,
                        ...(node.model !== undefined ? { model: node.model } : {}),
                        tools: node.tools,
                      },
                );
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="graph-llm-tools">Tools (comma-separated)</FieldLabel>
            <GraphInput
              id="graph-llm-tools"
              value={(node.tools ?? []).join(', ')}
              placeholder="empty = no tools"
              onChange={(event) => {
                const tools = event.target.value
                  .split(',')
                  .map((part) => part.trim())
                  .filter((part) => part.length > 0);
                onChange({
                  type: 'llm:generate',
                  prompt: node.prompt,
                  ...(node.messages !== undefined ? { messages: node.messages } : {}),
                  ...(node.model !== undefined ? { model: node.model } : {}),
                  ...(tools.length > 0 ? { tools } : {}),
                });
              }}
            />
          </Field>
          <NodeModelFields
            nodeId={id}
            node={node}
            onChange={onChange}
            agentModelId={agentModelId}
            primaryNodeId={primaryNodeId}
            onPrimaryChange={onPrimaryChange}
          />
        </>
      );
    case 'control:route':
      return (
        <>
          <RouteNodeFields node={node} onChange={onChange} />
          <NodeModelFields
            nodeId={id}
            node={node}
            onChange={onChange}
            agentModelId={agentModelId}
          />
        </>
      );
    case 'tool:call': {
      if (!isToolCallBatch(node)) {
        return <JsonNodeEditor node={node} onChange={onChange} />;
      }
      const batch = node;
      return (
        <>
          <Field>
            <FieldLabel htmlFor="graph-tool-calls">Calls (expr)</FieldLabel>
            <GraphInput
              id="graph-tool-calls"
              value={batch.calls}
              onChange={(event) =>
                onChange({
                  type: 'tool:call',
                  calls: event.target.value,
                  concurrency: batch.concurrency,
                })
              }
            />
          </Field>
          <ConcurrencyField
            value={concurrencyString(batch.concurrency)}
            onChange={(concurrency) =>
              onChange({ type: 'tool:call', calls: batch.calls, concurrency })
            }
          />
        </>
      );
    }
    case 'control:assign':
    case 'control:spawn':
    case 'control:handoff':
    case 'control:goto':
    case 'control:map':
    case 'control:yield':
    case 'control:wait':
    case 'control:interrupt':
      return <ControlNodeFields node={node} onChange={onChange} />;
    default:
      return <JsonNodeEditor node={node} onChange={onChange} />;
  }
}
type RouteNode = Extract<Node, { type: 'control:route' }>;
const ROUTE_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
function RouteNodeFields({ node, onChange }: { node: RouteNode; onChange: (node: Node) => void }) {
  const routes = node.routes ?? [];
  const withRoutes = (next: GraphRoute[]): Node => ({ ...node, routes: next });
  return (
    <>
      <Field>
        <FieldLabel htmlFor="graph-route-prompt">Instruction (template)</FieldLabel>
        <GraphInput
          id="graph-route-prompt"
          value={node.prompt ?? ''}
          placeholder="optional; {$expr} slots allowed"
          onChange={(event) => {
            const value = event.target.value;
            onChange(value === '' ? { ...node, prompt: undefined } : { ...node, prompt: value });
          }}
        />
      </Field>
      <FieldGroup className="gap-1.5">
        <FieldLabel className="text-[11px]">Routes</FieldLabel>
        {routes.map((route, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input
              aria-label={`Route ${index + 1} key`}
              value={route.key}
              placeholder="key"
              className={`h-7 flex-1 font-mono text-[11px] ${
                ROUTE_KEY_RE.test(route.key) ? '' : 'border-destructive'
              }`}
              onChange={(event) => {
                const next = routes.map((item, i) =>
                  i === index ? { ...item, key: event.target.value } : item,
                );
                onChange(withRoutes(next));
              }}
            />
            <Input
              aria-label={`Route ${index + 1} label`}
              value={route.label ?? ''}
              placeholder="Label"
              className="h-7 w-20 text-[11px]"
              onChange={(event) => {
                const label = event.target.value;
                const next = routes.map((item, i) =>
                  i === index ? { ...item, label: label === '' ? undefined : label } : item,
                );
                onChange(withRoutes(next));
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label={`Remove route ${route.key}`}
              onClick={() => onChange(withRoutes(routes.filter((_, i) => i !== index)))}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-6 w-fit"
          onClick={() =>
            onChange(withRoutes([...routes, { key: `route-${routes.length + 1}`, label: '' }]))
          }
        >
          <PlusIcon /> Add route
        </Button>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="graph-route-min-confidence">Min confidence (0–1)</FieldLabel>
        <GraphInput
          id="graph-route-min-confidence"
          inputMode="decimal"
          value={node.minConfidence !== undefined ? String(node.minConfidence) : ''}
          placeholder="empty = accept any"
          onChange={(event) => {
            const raw = event.target.value.trim();
            const parsed = raw === '' ? undefined : Number(raw);
            onChange({
              ...node,
              minConfidence:
                parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
                  ? parsed
                  : undefined,
            });
          }}
        />
      </Field>
    </>
  );
}
export function JsonNodeEditor({ node, onChange }: { node: Node; onChange: (node: Node) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor="graph-node-json">Node (JSON)</FieldLabel>
      <Textarea
        id="graph-node-json"
        className="min-h-40 font-mono text-xs"
        value={safeJson(node)}
        onChange={(event) => {
          const parsed = tryParseNode(event.target.value);
          if (parsed !== undefined) {
            onChange(parsed);
          }
        }}
      />
    </Field>
  );
}
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}
function isToolCallBatch(node: Node): node is ToolCallBatch {
  if (node.type !== 'tool:call') {
    return false;
  }
  return 'calls' in node && typeof node.calls === 'string';
}
function tryParseNode(raw: string): Node | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'type' in parsed &&
      typeof (
        parsed as {
          type: unknown;
        }
      ).type === 'string'
    ) {
      return parsed as Node;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

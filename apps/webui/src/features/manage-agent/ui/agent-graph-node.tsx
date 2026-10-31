import { Handle, type NodeProps, Position } from '@xyflow/react';
import type { Node } from 'harnesys';
import { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import { specByType } from '../model/agent-graph-catalog';
import { type AgentGraphFlowNode, ROUTE_DEFAULT_HANDLE } from '../model/agent-graph-document';
import { graphTypeIcon, graphTypeTint } from './agent-graph-appearance';

interface RouteRow {
  handle: string;
  label: string;
}
function routeRows(spec: Node): RouteRow[] | undefined {
  if (spec.type !== 'control:route' || !Array.isArray(spec.routes)) {
    return undefined;
  }
  const rows: RouteRow[] = spec.routes
    .filter((route) => typeof route?.key === 'string')
    .map((route) => ({ handle: `route:${route.key}`, label: route.label ?? route.key }));
  return [...rows, { handle: ROUTE_DEFAULT_HANDLE, label: 'else' }];
}
function AgentGraphNodeInner({ id, data, selected }: NodeProps<AgentGraphFlowNode>) {
  const { spec, rankdir, primary } = data;
  const catalog = specByType(spec.type);
  const ports = catalog?.ports ?? { in: true, out: true };
  const isStart = spec.type === 'core:start';
  const isEnd = spec.type === 'core:end';
  const showTarget = ports.in && !isStart;
  const showSource = ports.out && !isEnd;
  const routes = routeRows(spec);
  const targetPosition = rankdir === 'LR' ? Position.Left : Position.Top;
  const sourcePosition = rankdir === 'LR' ? Position.Right : Position.Bottom;
  const tint = graphTypeTint(spec.type);
  const Icon = graphTypeIcon(spec.type);
  const isPrimary = spec.type === 'llm:generate' && primary === id;
  return (
    <div
      className={cn(
        'flex min-w-[148px] max-w-[176px] flex-col rounded-md border border-border bg-popover shadow-sm',
        selected && 'ring-1 ring-sidebar-ring',
      )}
    >
      <div className="flex items-center gap-2 px-1.5 py-1">
        {showTarget ? (
          <Handle
            type="target"
            position={targetPosition}
            className={cn('!size-1.5 !border-0', tint.handle)}
          />
        ) : null}
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-[6px]',
            tint.iconWrap,
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[12px] leading-4">
            {id}
            {isPrimary ? (
              <span className="ml-1 rounded bg-primary/15 px-1 align-middle font-medium text-[8px] text-primary uppercase">
                Default
              </span>
            ) : null}
          </p>
          <p className={cn('truncate font-mono text-[10px] leading-3', tint.label)}>
            {catalog?.label ?? spec.type}
          </p>
        </div>
        {showSource && routes === undefined ? (
          <Handle
            type="source"
            position={sourcePosition}
            className={cn('!size-1.5 !border-0', tint.handle)}
          />
        ) : null}
      </div>
      {routes !== undefined ? (
        <div className="flex flex-col gap-0.5 border-border/60 border-t px-1.5 py-1">
          {routes.map((route) => (
            <div key={route.handle} className="relative flex items-center justify-end pr-2">
              <span className="truncate font-mono text-[9px] text-muted-foreground">
                {route.label}
              </span>
              <Handle
                id={route.handle}
                type="source"
                position={sourcePosition}
                className={cn('!size-1.5 !border-0', tint.handle)}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
export const AgentGraphNode = memo(AgentGraphNodeInner);

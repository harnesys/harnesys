import type { AgentHook, HookHandlerSpec, HookHandlerType } from '@harnesys/contracts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { HookBinding } from './hook.ts';

export type HookPermission = 'process' | 'network' | 'mcp' | 'agents';

export interface HookGateStatus {
  status: 'granted' | 'denied';
  permission?: HookPermission;
  reason?: string;
}

export interface DroppedHook {
  hookId: string;
  event: string;
  reason: string;
}

export interface ResolvedHookBindings {
  bindings: HookBinding[];
  dropped: DroppedHook[];
}

const PERMISSION_LABELS: Record<HookPermission, string> = {
  process: 'Process',
  network: 'Network',
  mcp: 'MCP',
  agents: 'Agents',
};

export function hookRequiredPermission(handlerType: HookHandlerType): HookPermission | undefined {
  switch (handlerType) {
    case 'command':
      return 'process';
    case 'http':
      return 'network';
    case 'mcp_tool':
      return 'mcp';
    case 'agent':
      return 'agents';
    case 'prompt':
      return undefined;
  }
}

export function hookGateStatus(
  handler: HookHandlerSpec,
  permissions: PermissionMap | undefined,
): HookGateStatus {
  const permission = hookRequiredPermission(handler.type);
  if (permission === undefined) {
    return { status: 'granted' };
  }
  const gate = permissions?.[permission] ?? 'ask';
  if (gate === 'allow') {
    return { status: 'granted', permission };
  }
  return {
    status: 'denied',
    permission,
    reason: `requires ${PERMISSION_LABELS[permission]} = Allow (current: ${gate})`,
  };
}

export function hookIdOf(hook: AgentHook, agentId: string, index: number): string {
  return hook.id ?? `${agentId}:${hook.event}:${index}`;
}

export function resolveHookBindings(
  hooks: AgentHook[],
  opts: {
    agentId: string;
    root: string;
    permissions?: PermissionMap;
  },
): ResolvedHookBindings {
  const bindings: HookBinding[] = [];
  const dropped: DroppedHook[] = [];
  hooks.forEach((hook, index) => {
    const hookId = hookIdOf(hook, opts.agentId, index);
    if (hook.enabled === false) {
      dropped.push({ hookId, event: hook.event, reason: 'disabled' });
      return;
    }
    const gate = hookGateStatus(hook.handler, opts.permissions);
    if (gate.status === 'denied') {
      dropped.push({ hookId, event: hook.event, reason: gate.reason ?? 'denied' });
      return;
    }
    bindings.push({
      id: hookId,
      origin: 'agent',
      event: hook.event,
      ...(hook.matcher !== undefined ? { matcher: hook.matcher } : {}),
      handler: hook.handler,
      vars: { pluginRoot: opts.root, pluginData: opts.root },
    });
  });
  return { bindings, dropped };
}

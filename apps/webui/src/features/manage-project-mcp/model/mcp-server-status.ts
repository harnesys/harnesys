import type { ProjectMcpConfigServer, ProjectMcpServer } from '@harnesys/studio-shared';
export type McpServerStatusChip = string | undefined;
const OFFLINE_REASON_MAX_CHARS = 160;
export function pluginServerTitle(serverId: string, pluginName: string): string {
  const prefix = `plugin:${pluginName}:`;
  return serverId.startsWith(prefix) ? serverId.slice(prefix.length) : serverId;
}
export function pluginServerPointer(serverId: string, pluginName: string): string {
  return pluginServerTitle(serverId, pluginName);
}
export function lastCheckFailureReason(server: ProjectMcpConfigServer): string | undefined {
  const check = server.lastCheck;
  if (check === undefined || check.connected || !server.enabled || server.connected) {
    return undefined;
  }
  const error = check.error ?? 'probe failed';
  const clipped =
    error.length > OFFLINE_REASON_MAX_CHARS
      ? `${error.slice(0, OFFLINE_REASON_MAX_CHARS - 1)}…`
      : error;
  return `last check ${new Date(check.at).toLocaleString()}: ${clipped}`;
}
export function serverSummary(
  server: ProjectMcpConfigServer,
  live: ProjectMcpServer | undefined,
  statusChip: McpServerStatusChip,
): string {
  const { origin } = server;
  if (server.disabledByUser) {
    return 'stopped by you · approval kept · start to load tools';
  }
  if (origin.kind === 'plugin' && origin.status === 'blocked_by_grant') {
    if (origin.inertReason === 'needs_server_approval') {
      return 'blocked · needs server approval';
    }
    if (server.requiredGrant) {
      return `blocked · needs grant: ${server.requiredGrant}`;
    }
    if (statusChip) {
      return 'blocked · grant required';
    }
  }
  if (origin.kind === 'plugin' && origin.status !== 'native' && statusChip) {
    return `${origin.status} · see plugin diagnostics`;
  }
  const reason = lastCheckFailureReason(server);
  return `${server.toolCount} ${server.toolCount === 1 ? 'tool' : 'tools'}${live?.resources.length ? ` · ${live.resources.length} resources` : ''}${!server.enabled ? ' · disabled in .harnesys/mcp.json' : ''}${reason !== undefined ? ` · ${reason}` : ''}`;
}
export function serverStatusHint(server: ProjectMcpConfigServer): string {
  if (server.disabledByUser) {
    return 'Stopped — start it to load tools.';
  }
  const { origin } = server;
  if (origin.kind === 'plugin' && origin.status === 'blocked_by_grant') {
    if (origin.inertReason === 'needs_server_approval') {
      return 'Waiting for one-time server approval — press Approve.';
    }
    return `Waiting for grant${server.requiredGrant ? `: ${server.requiredGrant}` : ''} — allow it in the Plugins tab.`;
  }
  const reason = lastCheckFailureReason(server);
  if (reason !== undefined) {
    return `Offline — ${reason}.`;
  }
  return server.enabled
    ? 'Not loaded in this session — reload to connect.'
    : 'Disabled — enable it to load tools.';
}
export function shortToolName(name: string): string {
  return name.includes('__') ? name.split('__').slice(1).join('__') : name;
}

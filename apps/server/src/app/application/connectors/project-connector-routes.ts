import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';

export interface RouteContext {
  connector: ConnectorRecord;
  binding: ConnectorBindingRecord;
  agentName: string;
}

export interface RouteConnectors {
  listBindingsByThread(orgId: string, threadId: string): ConnectorBindingRecord[];
  findById(orgId: string, id: string): ConnectorRecord | undefined;
}

export interface RouteSelector {
  provider: string;
  agentName: string;
}

export function resolveThreadRoutes(
  connectors: RouteConnectors,
  orgId: string,
  threadId: string,
  selector: RouteSelector,
): RouteContext[] {
  const routes: RouteContext[] = [];
  for (const binding of connectors.listBindingsByThread(orgId, threadId)) {
    if (binding.threadId !== threadId) {
      continue;
    }
    const connector = connectors.findById(orgId, binding.connectorId);
    if (!connector || connector.status === 'paused' || connector.provider !== selector.provider) {
      continue;
    }
    routes.push({ connector, binding, agentName: selector.agentName });
  }
  return routes;
}

export function prefixForRoute(route: RouteContext): string {
  return prefixOf(route.binding.chatType, route.agentName);
}

export function prefixOf(chatType: string, agentName: string | undefined): string {
  if (chatType !== 'group' && chatType !== 'supergroup') {
    return '';
  }
  return `${agentName ?? 'Agent'}: `;
}

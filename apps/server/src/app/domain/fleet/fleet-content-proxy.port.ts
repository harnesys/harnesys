import type { ProxyRequest } from '@harnesys/contracts';

export abstract class FleetContentProxyPort {
  abstract requestProxy(nodeId: string, request: ProxyRequest): Promise<Response>;
}

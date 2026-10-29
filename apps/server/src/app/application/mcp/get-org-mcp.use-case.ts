import { Injectable } from '@harnesys/brix';
import type { ListOrgMcpResponse, McpLiveServer, McpTransportKind } from '@harnesys/contracts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';

export interface GetOrgMcpRequest {
  orgId: string;
}

@Injectable()
export class GetOrgMcpUseCase {
  constructor(private readonly executor: LocalExecutorPort) {}

  async execute(request: GetOrgMcpRequest): Promise<ListOrgMcpResponse> {
    const live = await this.executor.listMcpServers(request.orgId);
    const servers: McpLiveServer[] = live.map((server) => ({
      serverId: server.serverId,
      transport: toTransportKind(server.transport),
      connected: server.connected,
      toolCount: server.tools.length,
      tools: server.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
      })),
      resources: server.resources,
    }));
    return { servers };
  }
}

function toTransportKind(transport: string): McpTransportKind {
  if (transport === 'stdio') {
    return 'stdio';
  }
  return transport === 'sse' ? 'sse' : 'http';
}

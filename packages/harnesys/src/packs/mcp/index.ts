import { definePack } from '../../domain/pack.ts';
import type { McpManagePort } from '../../ports/mcp-manage.ts';
import { createMcpTools } from './create-mcp-tools.ts';
export interface McpCapabilityPorts {
  mcp: McpManagePort;
}
export const mcpCapability = definePack<McpCapabilityPorts, Record<string, unknown>>({
  name: 'mcp',
  version: '1.0.0',
  description:
    'MCP server management: mcp_list / mcp_connect / mcp_check / mcp_toggle / mcp_remove',
  icon: 'plug',
  meta: {
    tools: [
      { name: 'mcp_list', description: 'List MCP servers with config and live connection status.' },
      {
        name: 'mcp_connect',
        description: 'Register or replace an MCP server, probe it and return its tools.',
      },
      { name: 'mcp_check', description: 'Health-check a configured MCP server.' },
      { name: 'mcp_toggle', description: 'Enable or disable a configured MCP server.' },
      { name: 'mcp_remove', description: 'Remove an MCP server entry.' },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createMcpTools({ mcp: ctx.ports.mcp, resolveScope: () => ctx.scope }),
  }),
});

import type { JsonSchema } from '../../domain/json-schema.ts';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { McpConnection, RawToolDescriptor } from './mcp-connector.port.ts';
export interface CreateMcpToolParams {
  serverId: string;
  prefix: string;
  raw: RawToolDescriptor;
  conn: McpConnection;
}
export function createMcpTool(params: CreateMcpToolParams): ToolDefinition {
  const { serverId, prefix, raw, conn } = params;
  return tool(`${prefix}${raw.name}`, {
    group: serverId,
    description: raw.description || `MCP tool ${raw.name} @ ${serverId}`,
    operations: ['mcp'],
    exposure: 'deferred',
    input: mcpInputSchema(raw.inputSchema),
    async execute(input) {
      try {
        return await conn.callTool(raw.name, input);
      } catch (error) {
        return {
          code: 'MCP_FAILED',
          message: error instanceof Error ? error.message : 'MCP tool call failed',
        };
      }
    },
  });
}
function mcpInputSchema(schema: Record<string, unknown> | undefined): JsonSchema {
  if (schema?.type === 'object') {
    return schema;
  }
  return { type: 'object', additionalProperties: true };
}

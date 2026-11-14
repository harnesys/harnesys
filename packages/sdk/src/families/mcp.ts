import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const MCP_SCHEMA_VERSION = 1;

export interface McpDescriptor {
  id: string;
  title: L10n;
  connection?: string;
}

export const McpDescriptorSchema = z.object({
  id: z.string().min(1),
  title: L10nSchema,
  connection: z.string().min(1).optional(),
});

export const mcpFamily = {
  family: 'mcp',
  versions: [MCP_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== MCP_SCHEMA_VERSION) {
      throw new Error(`mcp descriptor schema version ${v} is not supported`);
    }
    return McpDescriptorSchema;
  },
};

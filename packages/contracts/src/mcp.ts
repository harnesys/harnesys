import { z } from 'zod';
import { OrgIdSchema } from './org-machine.ts';

export const McpTransportKindSchema = z.enum(['stdio', 'http', 'sse']);
export type McpTransportKind = z.infer<typeof McpTransportKindSchema>;

export const McpOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('org') }),
  z.object({
    kind: z.literal('plugin'),
    pluginName: z.string().min(1),
    status: z.string().optional(),
    inertReason: z.string().optional(),
  }),
]);
export type McpOrigin = z.infer<typeof McpOriginSchema>;

export const McpToolSummarySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type McpToolSummary = z.infer<typeof McpToolSummarySchema>;

export const McpLiveServerSchema = z.object({
  serverId: z.string().min(1),
  transport: McpTransportKindSchema,
  connected: z.boolean(),
  toolCount: z.number().int().nonnegative(),
  tools: z.array(McpToolSummarySchema),
  resources: z.array(z.unknown()).default([]),
});
export type McpLiveServer = z.infer<typeof McpLiveServerSchema>;

export const ListOrgMcpResponseSchema = z.object({
  servers: z.array(McpLiveServerSchema),
});
export type ListOrgMcpResponse = z.infer<typeof ListOrgMcpResponseSchema>;

export const McpConfigServerSchema = z.object({
  serverId: z.string().min(1),
  enabled: z.boolean(),
  transport: McpTransportKindSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  connected: z.boolean(),
  toolCount: z.number().int().nonnegative(),
  origin: McpOriginSchema,
  disabledByUser: z.boolean().optional(),
  requiredGrant: z.string().optional(),
});
export type McpConfigServer = z.infer<typeof McpConfigServerSchema>;

export const ListOrgMcpConfigResponseSchema = z.object({
  servers: z.array(McpConfigServerSchema),
});
export type ListOrgMcpConfigResponse = z.infer<typeof ListOrgMcpConfigResponseSchema>;

export const UpsertOrgMcpServerBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    transport: McpTransportKindSchema,
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.transport === 'stdio' && (body.command === undefined || body.command.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'stdio transport requires command',
        path: ['command'],
      });
    }
    if (body.transport !== 'stdio' && (body.url === undefined || body.url.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: `${body.transport} transport requires url`,
        path: ['url'],
      });
    }
  });
export type UpsertOrgMcpServerBody = z.infer<typeof UpsertOrgMcpServerBodySchema>;

export const UpsertOrgMcpServerResponseSchema = z.object({
  server: McpConfigServerSchema,
});
export type UpsertOrgMcpServerResponse = z.infer<typeof UpsertOrgMcpServerResponseSchema>;

export const SetOrgMcpServerStateBodySchema = z.object({
  enabled: z.boolean(),
});
export type SetOrgMcpServerStateBody = z.infer<typeof SetOrgMcpServerStateBodySchema>;

export const OrgMcpParamsSchema = z.object({
  orgId: OrgIdSchema,
});
export type OrgMcpParams = z.infer<typeof OrgMcpParamsSchema>;

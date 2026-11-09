import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export const HostToAddonMethodSchema = z.enum([
  'register',
  'config.set',
  'config.get',
  'tools.call',
  'route.handle',
  'shutdown',
]);
export type HostToAddonMethod = z.infer<typeof HostToAddonMethodSchema>;

export const AddonToHostMethodSchema = z.enum(['log', 'events.emit']);
export type AddonToHostMethod = z.infer<typeof AddonToHostMethodSchema>;

export const RegisterParamsSchema = z.object({
  protocolVersion: z.number().int().positive(),
  addonId: z.string().min(1),
  version: z.string().min(1),
  orgId: z.string().min(1),
  dataDir: z.string().min(1),
  secretKeys: z.array(z.string()).default([]),
});
export type RegisterParams = z.infer<typeof RegisterParamsSchema>;

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogParamsSchema = z.object({
  level: LogLevelSchema,
  message: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).optional(),
});
export type LogParams = z.infer<typeof LogParamsSchema>;

export const ConfigSetParamsSchema = z.object({
  values: z.record(z.string(), z.unknown()),
});
export type ConfigSetParams = z.infer<typeof ConfigSetParamsSchema>;

export const ToolCallParamsSchema = z.object({
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
});
export type ToolCallParams = z.infer<typeof ToolCallParamsSchema>;

export const RouteHandleParamsSchema = z.object({
  method: z.string().min(1),
  path: z.string().min(1),
  query: z.record(z.string(), z.unknown()).default({}),
  body: z.unknown().optional(),
});
export type RouteHandleParams = z.infer<typeof RouteHandleParamsSchema>;

export const ContributionSummarySchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  descriptor: z.record(z.string(), z.unknown()).default({}),
});
export type ContributionSummary = z.infer<typeof ContributionSummarySchema>;

export const RegisterResultSchema = z.object({
  contributions: z.array(ContributionSummarySchema).default([]),
});
export type RegisterResult = z.infer<typeof RegisterResultSchema>;

export const ConfigValuesSchema = z.record(z.string(), z.unknown());
export type ConfigValues = z.infer<typeof ConfigValuesSchema>;

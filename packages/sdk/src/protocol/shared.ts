import { z } from 'zod';

export const SqlParamSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const DbRowSchema = z.record(z.string(), z.unknown());

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LogWriteParamsSchema = z.object({
  level: LogLevelSchema,
  message: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export type MessageFormat = 'text' | 'markdown' | 'html';

export interface TransportAttachment {
  id?: string;
  kind?: string;
  url: string;
  name?: string;
  mimeType?: string;
}

export interface TransportMessage {
  channel: string;
  text: string;
  format?: MessageFormat;
  replyTo?: string;
  topic?: string;
  attachments?: TransportAttachment[];
}

export const TransportAttachmentSchema = z.object({
  id: z.string().optional(),
  kind: z.string().optional(),
  url: z.string().min(1),
  name: z.string().optional(),
  mimeType: z.string().optional(),
});

export const TransportMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string(),
  format: z.enum(['text', 'markdown', 'html']).optional(),
  replyTo: z.string().optional(),
  topic: z.string().optional(),
  attachments: z.array(TransportAttachmentSchema).optional(),
});

export const HttpAuthSchema = z.object({
  connection: z.string().min(1),
  accountId: z.string().optional(),
  scheme: z.enum(['bearer', 'basic', 'header']),
  credentialKey: z.string().optional(),
  header: z.string().optional(),
});

export const HttpFetchParamsSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  auth: HttpAuthSchema.optional(),
});

export const HttpFetchResultSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
  bodyBase64: z.string().optional(),
});

export const AccountSummarySchema = z.object({
  accountId: z.string().min(1),
  label: z.string(),
  externalAccountId: z.string(),
  status: z.string(),
});

export const TriggerFireOutcomeSchema = z.enum(['fired', 'suppressed', 'busy', 'failed']);

export const InboundMessageSchema = z.object({
  channel: z.string().min(1),
  from: z.string().optional(),
  text: z.string(),
  payload: z.unknown().optional(),
});

export interface RouteRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export interface RouteHandleResult {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export const RouteRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  query: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  body: z.unknown().optional(),
});

export const RouteHandleResultSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

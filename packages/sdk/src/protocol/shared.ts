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
  name?: string;
  mimeType?: string;
  url?: string;
  path?: string;
  dataBase64?: string;
}

export interface TransportOption {
  id: string;
  label: string;
}

export interface TransportBindingSummary {
  provider: string;
  channel: string;
  threadId: string;
  createdAt: string;
}

export const TransportBindingSummarySchema = z.object({
  provider: z.string().min(1),
  channel: z.string().min(1),
  threadId: z.string().min(1),
  createdAt: z.string().min(1),
});

export interface TransportMessage {
  channel: string;
  text: string;
  format?: MessageFormat;
  replyTo?: string;
  topic?: string;
  attachments?: TransportAttachment[];
  options?: TransportOption[];
}

export const TransportAttachmentSchema = z
  .object({
    id: z.string().optional(),
    kind: z.string().optional(),
    name: z.string().optional(),
    mimeType: z.string().optional(),
    url: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    dataBase64: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      [value.url, value.path, value.dataBase64].filter((entry) => entry !== undefined).length === 1,
    { message: 'exactly one of url, path or dataBase64 is required' },
  );

export const TransportOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const TransportMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string(),
  format: z.enum(['text', 'markdown', 'html']).optional(),
  replyTo: z.string().optional(),
  topic: z.string().optional(),
  attachments: z.array(TransportAttachmentSchema).optional(),
  options: z.array(TransportOptionSchema).optional(),
});

export const HttpAuthSchema = z.object({
  connection: z.string().min(1),
  accountId: z.string().optional(),
  scheme: z.enum(['bearer', 'basic', 'header', 'path']),
  credentialKey: z.string().optional(),
  header: z.string().optional(),
  placeholder: z.string().min(1).optional(),
});

export const HttpFetchParamsSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  bodyBase64: z.string().optional(),
  responseEncoding: z.enum(['text', 'base64']).optional(),
  auth: HttpAuthSchema.optional(),
});

export const HttpFetchResultSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
  bodyBase64: z.string().optional(),
});

export const CloudRemoteEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['file', 'folder']),
  size: z.number().int().nonnegative().optional(),
  modifiedAt: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
});
export type CloudRemoteEntryWire = z.infer<typeof CloudRemoteEntrySchema>;

const sourceSelector = {
  sourceKind: z.string().min(1),
  accountId: z.string().min(1).optional(),
};

export const SourceListParamsSchema = z.object({
  ...sourceSelector,
  folderId: z.string().min(1),
  pageToken: z.string().optional(),
});

export const SourceListResultSchema = z.object({
  entries: z.array(CloudRemoteEntrySchema),
  nextPageToken: z.string().optional(),
});

export const SourceStatParamsSchema = z.object({
  ...sourceSelector,
  fileId: z.string().min(1),
});

export const SourceStatResultSchema = z.object({
  entry: CloudRemoteEntrySchema,
});

export const SourceReadParamsSchema = z.object({
  ...sourceSelector,
  fileId: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  length: z.number().int().positive().optional(),
});

export const SourceBytesResultSchema = z.object({
  data: z.string(),
  eof: z.boolean(),
});

export const SourceUploadParamsSchema = z.object({
  ...sourceSelector,
  parentId: z.string().min(1),
  fileId: z.string().min(1).optional(),
  name: z.string().min(1),
  data: z.string(),
  mimeType: z.string().min(1).optional(),
});

export const SourceUploadResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modifiedAt: z.string().min(1).optional(),
});

export const SourceMkdirParamsSchema = z.object({
  ...sourceSelector,
  parentId: z.string().min(1),
  name: z.string().min(1),
});

export const SourceMkdirResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const SourceRemoveParamsSchema = z.object({
  ...sourceSelector,
  fileId: z.string().min(1),
});

export const SourceExportParamsSchema = z.object({
  ...sourceSelector,
  fileId: z.string().min(1),
  mimeType: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  length: z.number().int().positive().optional(),
});

export const AccountSummarySchema = z.object({
  accountId: z.string().min(1),
  label: z.string(),
  externalAccountId: z.string(),
  status: z.string(),
});

export interface AppCredentials {
  kind: string;
  values: Record<string, unknown>;
  credentials: Record<string, string>;
}

export const AppCredentialsSchema = z.object({
  kind: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  credentials: z.record(z.string(), z.string()),
});

export const TriggerFireOutcomeSchema = z.object({
  outcome: z.enum(['fired', 'suppressed', 'busy', 'failed']),
  runId: z.string().nullable().optional(),
});

export const InboundAttachmentSchema = z
  .object({
    name: z.string().min(1),
    mediaType: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    dataBase64: z.string().min(1).optional(),
  })
  .refine((value) => (value.path === undefined) !== (value.dataBase64 === undefined), {
    message: 'exactly one of path or dataBase64 is required',
  });

export type InboundAttachment = z.infer<typeof InboundAttachmentSchema>;

export const InboundMessageSchema = z.object({
  channel: z.string().min(1),
  from: z.string().optional(),
  text: z.string(),
  payload: z.unknown().optional(),
  attachments: z.array(InboundAttachmentSchema).max(10).optional(),
});

export interface RouteRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  /**
   * Original request body as text, before JSON parsing. Signature verifiers
   * need the exact bytes: re-serialized JSON does not match what the sender
   * signed.
   */
  rawBody?: string;
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
  rawBody: z.string().optional(),
});

export const RouteHandleResultSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

export const FileStatParamsSchema = z.object({
  path: z.string().min(1),
});

export const FileStatResultSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mediaType: z.string().min(1),
  modifiedAt: z.string().min(1),
});

export const FileReadParamsSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().nonnegative().optional(),
  length: z.number().int().positive().optional(),
});

export const FileReadResultSchema = z.object({
  data: z.string(),
  eof: z.boolean(),
  size: z.number().int().nonnegative(),
  mediaType: z.string().min(1),
});

export const FileWriteParamsSchema = z.object({
  path: z.string().min(1),
  data: z.string(),
  append: z.boolean().optional(),
});

export const FileWriteResultSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
});

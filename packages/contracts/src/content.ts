import { z } from 'zod';

export const MAX_EDITOR_BYTES = 2 * 1024 * 1024;
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_TREE_ENTRIES = 20_000;

export const ContentEntryTypeSchema = z.enum(['file', 'dir']);
export type ContentEntryType = z.infer<typeof ContentEntryTypeSchema>;

export const ContentEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string(),
  type: ContentEntryTypeSchema,
  size: z.number().int().nonnegative().optional(),
  mtime: z.string().min(1).optional(),
});
export type ContentEntry = z.infer<typeof ContentEntrySchema>;

export const ContentTreeResponseSchema = z.object({
  path: z.string(),
  entries: z.array(ContentEntrySchema),
  truncated: z.boolean().optional(),
});
export type ContentTreeResponse = z.infer<typeof ContentTreeResponseSchema>;

export interface ContentTreeResult {
  entries: ContentEntry[];
  truncated: boolean;
}

export const ContentStatSchema = z.object({
  path: z.string(),
  type: ContentEntryTypeSchema,
  size: z.number().int().nonnegative(),
  mtime: z.string().min(1),
  etag: z.string().min(1),
});
export type ContentStat = z.infer<typeof ContentStatSchema>;

export const ContentWorktreeIdSchema = z.string().min(1).max(200);

export const ContentPathQuerySchema = z.object({
  path: z.string().default(''),
  worktreeId: ContentWorktreeIdSchema.optional(),
});
export type ContentPathQuery = z.infer<typeof ContentPathQuerySchema>;

export const ContentWriteBodySchema = z.object({
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
});
export type ContentWriteBody = z.infer<typeof ContentWriteBodySchema>;

export const ContentWriteResponseSchema = z.object({
  path: z.string(),
  etag: z.string().min(1),
});
export type ContentWriteResponse = z.infer<typeof ContentWriteResponseSchema>;

export const ContentMkdirBodySchema = z.object({
  path: z.string().min(1),
  worktreeId: ContentWorktreeIdSchema.optional(),
});
export type ContentMkdirBody = z.infer<typeof ContentMkdirBodySchema>;

export const ContentMoveItemSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type ContentMoveItem = z.infer<typeof ContentMoveItemSchema>;

export const ContentMoveBodySchema = z.object({
  items: z.array(ContentMoveItemSchema).min(1).max(500),
  worktreeId: ContentWorktreeIdSchema.optional(),
});
export type ContentMoveBody = z.infer<typeof ContentMoveBodySchema>;

export const ContentMoveResponseSchema = z.object({
  moved: z.array(ContentMoveItemSchema),
});
export type ContentMoveResponse = z.infer<typeof ContentMoveResponseSchema>;

export const ContentCopyBodySchema = z.object({
  items: z.array(ContentMoveItemSchema).min(1).max(500),
  worktreeId: ContentWorktreeIdSchema.optional(),
});
export type ContentCopyBody = z.infer<typeof ContentCopyBodySchema>;

export const ContentCopyResponseSchema = z.object({
  copied: z.array(ContentMoveItemSchema),
});
export type ContentCopyResponse = z.infer<typeof ContentCopyResponseSchema>;

export const ContentImportItemSchema = z.object({
  fromAbs: z.string().min(1),
  toRel: z.string().min(1),
});
export type ContentImportItem = z.infer<typeof ContentImportItemSchema>;

export const ContentImportBodySchema = z.object({
  items: z.array(ContentImportItemSchema).min(1).max(500),
  worktreeId: ContentWorktreeIdSchema.optional(),
});
export type ContentImportBody = z.infer<typeof ContentImportBodySchema>;

export const ContentImportResponseSchema = z.object({
  imported: z.array(ContentImportItemSchema),
});
export type ContentImportResponse = z.infer<typeof ContentImportResponseSchema>;

export const ContentDuplicateResponseSchema = z.object({
  path: z.string(),
});
export type ContentDuplicateResponse = z.infer<typeof ContentDuplicateResponseSchema>;

export const ContentDownloadResultSchema = z.object({
  name: z.string().min(1),
  bytesBase64: z.string(),
});
export type ContentDownloadResult = z.infer<typeof ContentDownloadResultSchema>;

export const ContentReadMetaSchema = z.object({
  path: z.string(),
  etag: z.string().min(1),
  size: z.number().int().nonnegative(),
  encoding: z.enum(['utf-8', 'base64']),
  content: z.string(),
});
export type ContentReadMeta = z.infer<typeof ContentReadMetaSchema>;

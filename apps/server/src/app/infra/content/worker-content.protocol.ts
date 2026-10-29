import { z } from 'zod';

export const WORKER_CONTENT_PATH = '/api/fleet/worker-content';
export const PROXY_CONTENT_TIMEOUT_MS = 30_000;

export const WorkerContentOpSchema = z.enum([
  'tree',
  'read',
  'write',
  'mkdir',
  'remove',
  'move',
  'copy',
  'stat',
  'duplicate',
  'reveal',
  'download',
]);
export type WorkerContentOp = z.infer<typeof WorkerContentOpSchema>;

export const WorkerHostOpSchema = z.enum(['assert-dir', 'list-dirs', 'mkdir-dir']);
export type WorkerHostOp = z.infer<typeof WorkerHostOpSchema>;

export const WorkerContentRequestSchema = z.object({
  op: WorkerContentOpSchema,
  sourceId: z.string().min(1),
  relPath: z.string().default(''),
  relPathTo: z.string().optional(),
  bytesBase64: z.string().optional(),
  ifMatch: z.string().nullable().optional(),
  worktreeId: z.string().min(1).max(200).optional(),
});
export type WorkerContentRequest = z.infer<typeof WorkerContentRequestSchema>;

export const WorkerHostBrowseRequestSchema = z.object({
  op: WorkerHostOpSchema,
  absolutePath: z.string().min(1),
});
export type WorkerHostBrowseRequest = z.infer<typeof WorkerHostBrowseRequestSchema>;

export const WorkerRequestSchema = z.discriminatedUnion('op', [
  WorkerContentRequestSchema,
  WorkerHostBrowseRequestSchema,
]);
export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;

export function isWorkerContentPath(path: string): boolean {
  const pathname = path.includes('?') ? path.slice(0, path.indexOf('?')) : path;
  return pathname === WORKER_CONTENT_PATH;
}

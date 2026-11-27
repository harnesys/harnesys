import { z } from 'zod';

export const THREAD_FILE_ROOTS = ['attachments', 'thread', 'tool-outputs'] as const;
export const ThreadFileRootSchema = z.enum(THREAD_FILE_ROOTS);
export type ThreadFileRoot = z.infer<typeof ThreadFileRootSchema>;

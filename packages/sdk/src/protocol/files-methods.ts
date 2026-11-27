import { z } from 'zod';
import { addonMethod } from './method-spec.ts';
import {
  FileReadParamsSchema,
  FileReadResultSchema,
  FileStatParamsSchema,
  FileStatResultSchema,
  FileWriteParamsSchema,
  FileWriteResultSchema,
} from './shared.ts';

const FileLocateParamsSchema = z.object({
  scope: z.enum(['thread', 'workspace']),
});

const FileLocateResultSchema = z.object({
  path: z.string().min(1),
});

export const filesMethods = {
  'files.stat': addonMethod(FileStatParamsSchema, FileStatResultSchema, 'files.read'),
  'files.read': addonMethod(FileReadParamsSchema, FileReadResultSchema, 'files.read'),
  'files.write': addonMethod(FileWriteParamsSchema, FileWriteResultSchema, 'files.write'),
  'files.locate': addonMethod(FileLocateParamsSchema, FileLocateResultSchema, 'files.locate'),
};

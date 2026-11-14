import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';
import type { FieldSpec } from './field-spec.ts';
import { FieldSpecSchema } from './field-spec.ts';
import {
  type JsonSchemaSubset,
  JsonSchemaSubsetSchema,
  validateInputSchema,
} from './json-schema.ts';

export const TOOL_PACK_SCHEMA_VERSION = 1;

export type ToolEffect = 'read' | 'write' | 'destructive';

export interface ToolDescriptor {
  name: string;
  description: L10n;
  inputSchema: JsonSchemaSubset;
  outputSchema?: JsonSchemaSubset;
  effect: ToolEffect;
  idempotent?: boolean;
  timeoutSec?: number;
  maxResultKb?: number;
}

export interface ToolPackDescriptor {
  name: string;
  title: L10n;
  description: L10n;
  icon?: string;
  connection?: string;
  specFields?: FieldSpec[];
  skills?: string[];
  tools: ToolDescriptor[];
}

const inputSchemaIssues = (descriptor: ToolPackDescriptor, ctx: z.RefinementCtx): void => {
  descriptor.tools.forEach((tool, index) => {
    for (const violation of validateInputSchema(tool.inputSchema)) {
      ctx.addIssue({
        code: 'custom',
        path: ['tools', index, 'inputSchema', violation.path],
        message: `${violation.code}: ${violation.message}`,
      });
    }
    if (tool.outputSchema !== undefined) {
      for (const violation of validateInputSchema(tool.outputSchema)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tools', index, 'outputSchema', violation.path],
          message: `${violation.code}: ${violation.message}`,
        });
      }
    }
  });
};

export const ToolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: L10nSchema,
  inputSchema: JsonSchemaSubsetSchema,
  outputSchema: JsonSchemaSubsetSchema.optional(),
  effect: z.enum(['read', 'write', 'destructive']),
  idempotent: z.boolean().optional(),
  timeoutSec: z.number().int().positive().optional(),
  maxResultKb: z.number().int().positive().optional(),
});

export const ToolPackDescriptorSchema = z
  .object({
    name: z.string().min(1),
    title: L10nSchema,
    description: L10nSchema,
    icon: z.string().optional(),
    connection: z.string().min(1).optional(),
    specFields: z.array(FieldSpecSchema).optional(),
    skills: z.array(z.string().min(1)).optional(),
    tools: z.array(ToolDescriptorSchema).min(1),
  })
  .superRefine(inputSchemaIssues);

export const toolPackFamily = {
  family: 'tool-pack',
  versions: [TOOL_PACK_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== TOOL_PACK_SCHEMA_VERSION) {
      throw new Error(`tool-pack descriptor schema version ${v} is not supported`);
    }
    return ToolPackDescriptorSchema;
  },
};

import { z } from 'zod';
import type { AddonContext } from '../context.ts';

export const ToolInputSchema = z.record(z.string(), z.string());
export type ToolInput = z.infer<typeof ToolInputSchema>;

export const ToolDescriptorSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(64),
  description: z.string().min(1),
  input: ToolInputSchema.default({}),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export type ToolResult =
  | { readonly text: string; readonly ok: true }
  | { readonly ok: false; readonly error: string };

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: AddonContext,
) => Promise<ToolResult> | ToolResult;

export interface ToolContribution {
  readonly id: string;
  readonly tool: ToolDescriptor;
  readonly handle: ToolHandler;
}

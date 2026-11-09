import { z } from 'zod';
import type { AddonContext } from '../context.ts';

export const HookEventSchema = z.enum([
  'PreModelCall',
  'PostModelCall',
  'UserPromptSubmit',
  'ToolCall',
]);
export type HookEvent = z.infer<typeof HookEventSchema>;

export const HookEffectSchema = z.enum(['block', 'update_input', 'update_output', 'log']);
export type HookEffect = z.infer<typeof HookEffectSchema>;

export interface HookPayload {
  readonly [key: string]: unknown;
}

export type HookHandler = (
  payload: HookPayload,
  ctx: AddonContext,
) => Promise<HookPayload> | HookPayload;

export const HookDescriptorSchema = z.object({
  on: HookEventSchema,
  effect: HookEffectSchema,
  order: z.number().int().default(100),
});
export type HookDescriptor = z.infer<typeof HookDescriptorSchema>;

export interface HookContribution {
  readonly id: string;
  readonly hook: HookDescriptor;
  readonly apply: HookHandler;
}

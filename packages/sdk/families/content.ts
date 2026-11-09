import { z } from 'zod';

export const ContentKindsSchema = z.enum(['skill', 'prompt', 'command', 'preset']);

export const ContentDescriptorSchema = z.object({
  dir: z.string().min(1),
  kinds: z.array(ContentKindsSchema).optional(),
});

export interface ContentDescriptorInput {
  readonly dir: string;
  readonly kinds?: readonly ContentKind[];
}

export type ContentKind = z.infer<typeof ContentKindsSchema>;

export interface ContentDescriptor {
  readonly dir: string;
  readonly kinds: readonly ContentKind[];
}

export const defaultContentKinds: readonly ContentKind[] = ['skill'];

export function resolveContentDescriptor(input: ContentDescriptorInput): ContentDescriptor {
  return { dir: input.dir, kinds: input.kinds ?? defaultContentKinds };
}

export interface ContentContribution {
  readonly id: string;
  readonly content: ContentDescriptorInput;
  readonly resolve?: (input: ContentDescriptorInput) => ContentDescriptor;
}

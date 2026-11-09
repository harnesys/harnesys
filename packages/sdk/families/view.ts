import { z } from 'zod';
import { ViewContainerSchema, ViewKindSchema } from '../manifest.ts';

export const ViewDescriptorSchema = z.object({
  container: ViewContainerSchema,
  kind: ViewKindSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  section: z.string().optional(),
});
export type ViewDescriptor = z.infer<typeof ViewDescriptorSchema>;

export interface ViewContribution {
  readonly id: string;
  readonly view: ViewDescriptor;
}

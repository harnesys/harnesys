import { z } from 'zod';

export const WorkerDescriptorSchema = z.object({
  reason: z.string().min(1),
  mode: z.enum(['resident', 'demand']).default('resident'),
});
export type WorkerDescriptor = z.infer<typeof WorkerDescriptorSchema>;

export interface WorkerHandle {
  readonly signal: { readonly aborted: boolean };
}

export type WorkerRun = (handle: WorkerHandle) => Promise<void>;

export interface WorkerContribution {
  readonly id: string;
  readonly worker: WorkerDescriptor;
  readonly run: WorkerRun;
}

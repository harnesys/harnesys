import { hasTriggerScripts, TriggerScriptsSchema, WorkspaceRefSchema } from '@harnesys/contracts';
import { z } from 'zod';

export const TriggerTargetSchema = z
  .object({
    threadId: z.string().uuid(),
    agentId: z.string().uuid(),
    modeId: z.string().trim().min(1).max(48).optional(),
    workspace: WorkspaceRefSchema.optional(),
    scripts: TriggerScriptsSchema.optional(),
  })
  .superRefine((target, ctx) => {
    if (target.scripts && hasTriggerScripts(target.scripts) && !target.scripts.acknowledged) {
      ctx.addIssue({
        code: 'custom',
        path: ['scripts', 'acknowledged'],
        message: 'trigger scripts must be acknowledged before saving',
      });
    }
  });

export type TriggerTarget = z.infer<typeof TriggerTargetSchema>;

export function scriptsIssueMessages(error: z.ZodError): string[] {
  return error.issues
    .filter((issue) => issue.path[0] === 'scripts')
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

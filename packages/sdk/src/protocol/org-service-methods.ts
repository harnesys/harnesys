import { z } from 'zod';
import { addonMethod } from './method-spec.ts';

const str = z.string().min(1);

/** Read/action methods over org-scoped thread, run, usage and skill state (§6.4). */
export const orgServiceMethods = {
  'runs.list': addonMethod(
    z.object({ threadId: str, status: z.string().optional() }),
    z.object({
      runs: z.array(
        z.object({
          runId: str,
          status: z.string(),
          startedAt: z.string().nullable(),
          agentId: z.string().nullable(),
        }),
      ),
    }),
    'runs.read',
  ),
  'threads.compact': addonMethod(
    z.object({ threadId: str }),
    z.union([
      z.object({
        compacted: z.literal(true),
        id: str,
        coveredFrom: z.number(),
        coveredUntil: z.number(),
        tokensBefore: z.number(),
        tokensAfter: z.number(),
      }),
      z.object({ compacted: z.literal(false), reason: z.string().optional() }),
    ]),
    'threads.compact',
  ),
  'usage.summary': addonMethod(
    z.object({ threadId: str.optional(), since: str.optional() }),
    z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      costUsd: z.number(),
      byModel: z.array(
        z.object({
          model: str,
          inputTokens: z.number(),
          outputTokens: z.number(),
          costUsd: z.number(),
        }),
      ),
    }),
    'usage.read',
  ),
  'skills.list': addonMethod(
    z.object({ threadId: str.optional() }),
    z.object({
      skills: z.array(
        z.object({
          id: str,
          name: str,
          description: z.string().nullable(),
          source: z.string(),
        }),
      ),
    }),
    'skills.read',
  ),
  'org.settings.get': addonMethod(z.object({}), z.object({ timezone: str }), 'org.read'),
  'approvals.request': addonMethod(
    z.object({
      interruptId: str,
      agentId: str,
      threadId: str.optional(),
      kind: z.enum(['tool', 'spend', 'memory', 'question', 'file_access']),
      question: str,
      options: z.array(z.enum(['approve', 'approve_once', 'deny', 'block_path', 'close'])).min(1),
      context: z.object({
        source: str,
        ops: z.array(str).optional(),
        tool: z
          .object({
            name: str,
            inputPreview: z.string().optional(),
            command: z.string().optional(),
            truncated: z.boolean().optional(),
          })
          .optional(),
        note: z.string().optional(),
      }),
    }),
    z.object({ id: str }),
    'approvals.request',
  ),
};

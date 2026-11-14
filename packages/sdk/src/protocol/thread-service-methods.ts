import { z } from 'zod';
import { addonMethod } from './method-spec.ts';

const str = z.string();
const empty = z.object({});

/** Threads read/write and the agents roster: addon-to-host service methods. */
export const threadServiceMethods = {
  'threads.create': addonMethod(
    z.object({
      title: str.optional(),
      agentId: z.string().uuid(),
      kind: z.enum(['chat', 'group']).optional(),
      responderMode: z.enum(['auto', 'mention']).optional(),
    }),
    z.object({ threadId: str }),
    'threads.create',
  ),
  'threads.get': addonMethod(
    z.object({ threadId: str }),
    z.object({
      thread: z
        .object({
          threadId: str,
          kind: str,
          title: str,
          responderMode: z.enum(['auto', 'mention']),
          autoReplyAgentId: str.nullable(),
          agents: z.array(z.object({ id: str, name: str })),
        })
        .optional(),
    }),
    'threads.read',
  ),
  'threads.patch': addonMethod(
    z.object({
      threadId: str,
      responderMode: z.enum(['auto', 'mention']).optional(),
    }),
    empty,
    'threads.write',
  ),
  'agents.list': addonMethod(
    z.object({}),
    z.object({
      agents: z.array(z.object({ id: str, name: str, status: str.optional() })),
    }),
    'agents.read',
  ),
};

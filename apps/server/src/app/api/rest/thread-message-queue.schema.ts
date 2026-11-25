import { MessageQuoteSchema } from '@harnesys/contracts';
import { z } from 'zod';

export const ThreadQueueAttachmentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['image', 'audio', 'video', 'file']),
  name: z.string(),
  mediaType: z.string(),
  path: z.string(),
});
export type ThreadQueueAttachment = z.infer<typeof ThreadQueueAttachmentSchema>;

export const ThreadQueueEnqueueBodySchema = z.object({
  text: z.string().min(1),
  attachments: z.array(ThreadQueueAttachmentSchema).optional(),
  origin: z.string().min(1).optional(),
  clientEventId: z.string().min(1).optional(),
  quote: MessageQuoteSchema.optional(),
});
export type ThreadQueueEnqueueBody = z.infer<typeof ThreadQueueEnqueueBodySchema>;

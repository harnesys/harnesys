import { z } from 'zod';

export const IssueTypeSchema = z.enum([
  'task',
  'bug',
  'research',
  'feature',
  'improvement',
  'review',
]);
export type IssueType = z.infer<typeof IssueTypeSchema>;

export const IssuePrioritySchema = z.number().int().min(1).max(4);
export type IssuePriority = z.infer<typeof IssuePrioritySchema>;

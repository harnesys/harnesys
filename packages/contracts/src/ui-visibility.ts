import { z } from 'zod';

export const UiVisibilitySchema = z.enum(['org', 'host']);
export type UiVisibility = z.infer<typeof UiVisibilitySchema>;

import { z } from 'zod';

export const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/;

export const PresetIdSchema = z.string().regex(PRESET_ID_PATTERN);
export type PresetId = z.infer<typeof PresetIdSchema>;

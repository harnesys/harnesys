import { z } from 'zod';
import type { L10n } from '../manifest/l10n.ts';
import { L10nSchema } from '../manifest/l10n.ts';

export const TRANSPORT_SCHEMA_VERSION = 1;

export interface TransportCapabilities {
  threads: boolean;
  edit: boolean;
  typing: boolean;
  attachments: boolean;
  topics?: boolean;
  reactions?: boolean;
  readReceipts?: boolean;
}

export interface TransportDescriptor {
  provider: string;
  title: L10n;
  connection: string;
  capabilities: TransportCapabilities;
  limits: { textMax: number };
}

export const TransportCapabilitiesSchema = z.object({
  threads: z.boolean(),
  edit: z.boolean(),
  typing: z.boolean(),
  attachments: z.boolean(),
  topics: z.boolean().optional(),
  reactions: z.boolean().optional(),
  readReceipts: z.boolean().optional(),
});

export const TransportDescriptorSchema = z.object({
  provider: z.string().min(1),
  title: L10nSchema,
  connection: z.string().min(1),
  capabilities: TransportCapabilitiesSchema,
  limits: z.object({ textMax: z.number().int().positive() }),
});

export const transportFamily = {
  family: 'transport',
  versions: [TRANSPORT_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== TRANSPORT_SCHEMA_VERSION) {
      throw new Error(`transport descriptor schema version ${v} is not supported`);
    }
    return TransportDescriptorSchema;
  },
};

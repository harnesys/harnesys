import type { AddonLogLevelValue } from './addon-read-models.port.ts';

export interface AddonLogLineView {
  seq: number;
  at: string;
  level: AddonLogLevelValue;
  message: string;
  fields: Record<string, unknown>;
}

export abstract class AddonLogReaderPort {
  abstract tail(orgId: string, addonId: string, since: number): AddonLogLineView[];
}

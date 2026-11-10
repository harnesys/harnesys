import type { LogLevelValue } from '../../../infra/addons/services/sinks.ts';

export interface AddonLogLineView {
  seq: number;
  at: string;
  level: LogLevelValue;
  message: string;
  fields: Record<string, unknown>;
}

export abstract class AddonLogReaderPort {
  abstract tail(orgId: string, addonId: string, since: number): AddonLogLineView[];
}

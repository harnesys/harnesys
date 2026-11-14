export type AddonLogLevelValue = 'debug' | 'info' | 'warn' | 'error';

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

export abstract class AddonDataExportPort {
  abstract export(orgId: string, addonId: string): Promise<Record<string, unknown>>;
}

export abstract class AddonConfigReadPort {
  abstract values(orgId: string, addonId: string): Record<string, unknown>;
}

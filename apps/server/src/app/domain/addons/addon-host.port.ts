import type { ModuleDestroyHook } from '@harnesys/brix';
import type {
  AddonConfigValues,
  AddonDetail,
  AddonLogLine,
  AddonSummary,
} from '@harnesys/contracts';

export abstract class AddonHostPort implements ModuleDestroyHook {
  abstract onModuleDestroy(): Promise<void>;
  abstract list(orgId: string): AddonSummary[];
  abstract detail(orgId: string, addonId: string): AddonDetail;
  abstract enable(orgId: string, addonId: string): Promise<AddonSummary>;
  abstract disable(orgId: string, addonId: string): Promise<AddonSummary>;
  abstract setConfig(
    orgId: string,
    addonId: string,
    values: AddonConfigValues,
  ): Promise<AddonConfigValues>;
  abstract logsOf(orgId: string, addonId: string, since?: number): AddonLogLine[];
}

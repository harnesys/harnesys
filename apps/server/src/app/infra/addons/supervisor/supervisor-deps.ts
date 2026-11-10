import type { EffectivePermission } from '@harnesys/sdk';

export interface SupervisorRequestHandler {
  handle(orgId: string, addonId: string, message: string): Promise<string | null>;
}

export interface SupervisorPermissionsProvider {
  effectivePermissions(orgId: string, addonId: string): EffectivePermission[];
  experimentalMethods(addonId: string): string[];
  deprecations(addonId: string): string[];
}

export interface SupervisorHandlersValidator {
  validate(
    addonId: string,
    handlers: readonly string[],
  ): { ok: boolean; missing: readonly string[] };
}

export interface SupervisorReplayHook {
  replay(orgId: string, addonId: string): Promise<void>;
}

export interface ReasonsToLiveProvider {
  hasReason(orgId: string, addonId: string): boolean;
}

export abstract class SupervisorTimers {
  abstract setTimeout(fn: () => void, ms: number): unknown;
  abstract clearTimeout(handle: unknown): void;
}

export class SystemSupervisorTimers extends SupervisorTimers {
  setTimeout(fn: () => void, ms: number): unknown {
    return globalThis.setTimeout(fn, ms);
  }

  clearTimeout(handle: unknown): void {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

export abstract class SupervisorHooks {
  abstract readonly requestHandler: SupervisorRequestHandler;
  abstract readonly permissionsProvider: SupervisorPermissionsProvider;
  abstract readonly handlersValidator: SupervisorHandlersValidator;
  abstract readonly replayHook: SupervisorReplayHook;
  abstract readonly reasonsToLive: ReasonsToLiveProvider;
}

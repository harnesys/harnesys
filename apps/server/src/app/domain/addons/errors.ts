import { DomainException } from '@harnesys/brix';
import type { AddonErrorReason, Violation } from '@harnesys/sdk';
import { AddonError, AddonErrorDataSchema, AddonErrorReasonSchema } from '@harnesys/sdk';

export type {
  AddonErrorData,
  AddonErrorReason,
} from '@harnesys/sdk';
export { AddonError, AddonErrorDataSchema, AddonErrorReasonSchema };

export const HOST_ADDON_ERROR_CODES = [
  'incompatible',
  'needs_consent',
  'in_use',
  'manifest_invalid',
  'quarantined',
] as const;

export type HostAddonErrorCode = (typeof HOST_ADDON_ERROR_CODES)[number];

export type AddonErrorCode = AddonErrorReason | HostAddonErrorCode;

export function rpcReasonOf(code: AddonErrorCode): AddonErrorReason {
  switch (code) {
    case 'incompatible':
      return 'unsupported';
    case 'needs_consent':
    case 'in_use':
      return 'conflict';
    case 'manifest_invalid':
      return 'invalid_params';
    case 'quarantined':
      return 'unavailable';
    default:
      return code;
  }
}

export class AddonException extends DomainException {
  constructor(
    readonly reason: AddonErrorCode,
    readonly status: number,
    message: string,
    details?: unknown,
  ) {
    super(reason, message, details);
    this.name = new.target.name;
  }
}

export class AddonIncompatibleException extends AddonException {
  constructor(readonly reasons: readonly string[]) {
    super('incompatible', 409, `Addon is incompatible: ${reasons.join('; ')}`, { reasons });
  }
}

export class AddonNeedsConsentException extends AddonException {
  constructor(
    readonly pendingVersion: string,
    readonly addedPermissions: readonly string[],
  ) {
    super(
      'needs_consent',
      409,
      `Version ${pendingVersion} expands permissions and requires consent`,
      { pendingVersion, addedPermissions },
    );
  }
}

export class AddonInUseException extends AddonException {
  constructor(message: string, details?: unknown) {
    super('in_use', 409, message, details);
  }
}

export class AddonManifestInvalidException extends AddonException {
  constructor(readonly violations: readonly Violation[]) {
    super('manifest_invalid', 422, `Addon manifest is invalid (${violations.length} violations)`, {
      violations,
    });
  }
}

export class AddonMigrationFailedException extends AddonException {
  constructor(detail: string) {
    super('migration_failed', 500, `Addon data migration failed: ${detail}`, { detail });
  }
}

export class AddonPermissionDeniedException extends AddonException {
  constructor(
    readonly permissionId: string,
    message?: string,
  ) {
    super('permission_denied', 403, message ?? `Permission denied: ${permissionId}`, {
      permissionId,
    });
  }
}

export class AddonQuarantinedException extends AddonException {
  constructor(addonId: string, detail?: string) {
    super('quarantined', 409, `Addon is quarantined: ${addonId}`, { detail });
  }
}

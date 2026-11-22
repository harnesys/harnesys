import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class OrgNotFoundException extends EntityNotFoundException {
  constructor(orgId: string) {
    super(`Organization not found: ${orgId}`, { orgId });
  }
}

export class OrgNameRequiredException extends ValidationException {
  constructor() {
    super('Organization name is required');
  }
}

export class OrgWorkspacePathInvalidException extends ValidationException {
  constructor(localPath: string) {
    super(`Organization workspace path must be absolute: ${localPath}`, { localPath });
  }
}

export class OrgBackupInvalidException extends ValidationException {
  constructor(reason: string) {
    super(`Invalid organization backup: ${reason}`);
  }
}

export class OrgBackupConflictException extends ValidationException {
  constructor(orgId: string) {
    super(
      `Organization ${orgId} already exists on this machine. Delete or rename it before restoring this backup.`,
      { orgId },
    );
  }
}

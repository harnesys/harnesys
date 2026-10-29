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

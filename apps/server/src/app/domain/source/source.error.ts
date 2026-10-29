import {
  ConflictException,
  DomainException,
  EntityNotFoundException,
  ForbiddenException,
  ValidationException,
} from '@harnesys/brix';

export class SourceNotFoundException extends EntityNotFoundException {
  constructor(sourceId: string) {
    super(`Source not found: ${sourceId}`, { sourceId });
  }
}

export class SourcePathInvalidException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class ManagedSourceDetachForbiddenException extends ForbiddenException {
  constructor(sourceId: string) {
    super(`Managed source cannot be detached: ${sourceId}`, { sourceId });
  }
}

export class SourceAlreadyExistsException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class GitOperationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class SourceDriverMismatchException extends ValidationException {
  constructor(sourceId: string, expected: string, actual: string) {
    super(`Source ${sourceId} driver is ${actual}, expected ${expected}`, {
      sourceId,
      expected,
      actual,
    });
  }
}

export class SourceHostMismatchException extends DomainException {
  constructor(sourceId: string, expectedHostId: string, currentHostId: string) {
    super('SOURCE_HOST_MISMATCH', `Source ${sourceId} is bound to host ${expectedHostId}`, {
      sourceId,
      expectedHostId,
      currentHostId,
    });
  }
}

export class SourceMaterializationAbsentException extends DomainException {
  constructor(sourceId: string, hostId: string) {
    super(
      'SOURCE_MATERIALIZATION_ABSENT',
      `Source ${sourceId} has no materialization on host ${hostId}`,
      {
        sourceId,
        hostId,
      },
    );
  }
}

export class SourceMaterializationFailedException extends DomainException {
  constructor(sourceId: string, hostId: string, cause: string) {
    super(
      'SOURCE_MATERIALIZATION_FAILED',
      `Source ${sourceId} materialization failed on host ${hostId}: ${cause}`,
      {
        sourceId,
        hostId,
      },
    );
  }
}

export class WorktreeNotFoundException extends EntityNotFoundException {
  constructor(worktreeId: string) {
    super(`Worktree not found: ${worktreeId}`, { worktreeId });
  }
}

export class WorktreeNotCleanException extends DomainException {
  constructor(worktreeId: string, message: string) {
    super('WORKTREE_NOT_CLEAN', message, { worktreeId });
  }
}

export class WorktreeBranchInUseException extends DomainException {
  constructor(branch: string, occupyingWorktreeId: string) {
    super(
      'BRANCH_IN_USE',
      `Branch ${branch} is already checked out in worktree ${occupyingWorktreeId}`,
      { branch, worktreeId: occupyingWorktreeId },
    );
  }
}

export class WorktreeSourceNotReadyException extends DomainException {
  constructor(sourceId: string, hostId: string) {
    super('SOURCE_NOT_READY', `Source ${sourceId} is not ready on host ${hostId}`, {
      sourceId,
      hostId,
    });
  }
}

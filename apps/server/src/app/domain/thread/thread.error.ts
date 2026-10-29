import {
  ConflictException,
  DomainException,
  EntityNotFoundException,
  ValidationException,
} from '@harnesys/brix';

export class ThreadNotFoundException extends EntityNotFoundException {
  constructor(threadId: string) {
    super(`Thread not found: ${threadId}`, { threadId });
  }
}

export class ThreadValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class RunNotFoundException extends EntityNotFoundException {
  constructor(runId: string) {
    super(`Run not found: ${runId}`, { runId });
  }
}

export class RunConflictException extends ConflictException {
  constructor(
    message: string,
    details?: {
      runId?: string;
      pendingAskId?: string;
      agentId?: string;
      day?: string;
      spentUsd?: number;
      limitUsd?: number;
    },
  ) {
    super(message, details);
  }
}

export class CompactionNotConfiguredException extends DomainException {
  constructor() {
    super('compaction_not_configured', 'Compaction is not configured');
  }
}

import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class AgentNotFoundException extends EntityNotFoundException {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, { agentId });
  }
}

export class AgentValidationException extends ValidationException {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

export class AgentConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ExecutionProfileValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class ExecutionProfileNotFoundException extends EntityNotFoundException {
  constructor(profileId: string) {
    super(`Execution profile not found: ${profileId}`, { profileId });
  }
}

export class ExecutionProfileNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Execution profile name already taken: ${name}`, { name });
  }
}

export class ExecutionProfileNodeNotFoundException extends EntityNotFoundException {
  constructor(nodeId: string) {
    super(`Node not found in org: ${nodeId}`, { nodeId });
  }
}

export class ExecutionProfileInUseException extends ConflictException {
  constructor(
    profileId: string,
    usage: { orgDefault: boolean; agents: number; boardRules: number },
  ) {
    const parts: string[] = [];
    if (usage.orgDefault) {
      parts.push('organization default');
    }
    if (usage.agents > 0) {
      parts.push(`${usage.agents} agent${usage.agents === 1 ? '' : 's'}`);
    }
    if (usage.boardRules > 0) {
      parts.push(`${usage.boardRules} board rule${usage.boardRules === 1 ? '' : 's'}`);
    }
    const detail = parts.length > 0 ? `: ${parts.join(', ')}` : '';
    super(`Execution profile is in use${detail}`, { profileId, ...usage });
  }
}

export class ExecutionProfileSystemException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

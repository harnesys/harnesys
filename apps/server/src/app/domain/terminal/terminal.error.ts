import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class TerminalSessionNotFoundException extends EntityNotFoundException {
  constructor(sessionId: string) {
    super(`Terminal session not found: ${sessionId}`, { sessionId });
  }
}

export class TerminalCwdInvalidException extends ValidationException {
  constructor(cwd: string, root: string) {
    super(`Terminal cwd must be inside the source root`, { cwd, root });
  }
}

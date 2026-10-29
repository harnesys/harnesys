import {
  ConflictException,
  EntityNotFoundException,
  ForbiddenException,
  ValidationException,
} from '@harnesys/brix';

export class SecretLockedException extends ForbiddenException {
  constructor(message = 'Secret store is locked') {
    super(message);
  }
}

export class SecretValueTooLargeException extends ValidationException {
  constructor(maxBytes: number) {
    super(`Secret value exceeds ${maxBytes} bytes`);
  }
}

export class VaultValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class VaultNotFoundException extends EntityNotFoundException {
  constructor(name: string) {
    super(`Vault entry not found: ${name}`, { name });
  }
}

export class VaultConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

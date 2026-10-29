import { ConflictException, ValidationException } from '@harnesys/brix';

export class MemorySettingsValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class MemoryConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

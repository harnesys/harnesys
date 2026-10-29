import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ModePresetNotFoundException extends EntityNotFoundException {
  constructor(id: string) {
    super(`mode preset not found: ${id}`, { id });
  }
}

export class ModePresetConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class ModePresetValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

import { DomainException } from '@harnesys/brix';

export class PresetNotFoundException extends DomainException {
  constructor(id: string) {
    super('PRESET_NOT_FOUND', `preset not found: ${id}`, { id });
  }
}

export class PresetValidationException extends DomainException {
  constructor(message: string, issues?: unknown) {
    super('PRESET_VALIDATION', message, issues);
  }
}

export class PresetConflictException extends DomainException {
  constructor(message: string, details?: unknown) {
    super('PRESET_CONFLICT', message, details);
  }
}

export class PresetImmutableException extends DomainException {
  constructor(message: string, details?: unknown) {
    super('PRESET_IMMUTABLE', message, details);
  }
}

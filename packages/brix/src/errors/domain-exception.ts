export abstract class DomainException extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class EntityNotFoundException extends DomainException {
  constructor(message = 'Entity not found', details?: unknown) {
    super('ENTITY_NOT_FOUND', message, details);
  }
}

export class ConflictException extends DomainException {
  constructor(message = 'Conflict', details?: unknown) {
    super('CONFLICT', message, details);
  }
}

export class ForbiddenException extends DomainException {
  constructor(message = 'Forbidden', details?: unknown) {
    super('FORBIDDEN', message, details);
  }
}

export class UnauthorizedException extends DomainException {
  constructor(message = 'Unauthorized', details?: unknown) {
    super('UNAUTHORIZED', message, details);
  }
}

export class ValidationException extends DomainException {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class BusinessRuleException extends DomainException {
  constructor(message = 'Business rule violated', details?: unknown) {
    super('BUSINESS_RULE_VIOLATION', message, details);
  }
}

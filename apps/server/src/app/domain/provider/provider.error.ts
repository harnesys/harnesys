import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ProviderNotFoundException extends EntityNotFoundException {
  constructor(providerId: string) {
    super(`Provider not found: ${providerId}`, { providerId });
  }
}

export class ProviderModelNotFoundException extends EntityNotFoundException {
  constructor(modelId: string) {
    super(`Provider model not found: ${modelId}`, { modelId });
  }
}

export class ProviderValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class ProviderConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

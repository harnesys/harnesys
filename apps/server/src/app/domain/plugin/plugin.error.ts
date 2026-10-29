import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class PluginValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class PluginNotFoundException extends EntityNotFoundException {
  constructor(name: string) {
    super(`plugin not found: ${name}`, { name });
  }
}

export class PluginConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class PluginRegistryNotFoundException extends EntityNotFoundException {
  constructor(id: string) {
    super(`registry ${id} not found`, { id });
  }
}

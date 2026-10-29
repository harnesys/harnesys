import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class KnowledgeSourceNotFoundException extends EntityNotFoundException {
  constructor(sourceId: string) {
    super(`Source not found: ${sourceId}`, { sourceId });
  }
}

export class KnowledgeValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ConnectorNotFoundException extends EntityNotFoundException {
  constructor(connectorId: string) {
    super(`Connector not found: ${connectorId}`, { connectorId });
  }
}

export class ConnectorConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class ConnectorValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class ConnectorPromotionRequiredException extends ConflictException {
  readonly code = 'connector_promotion_required';

  constructor(message = 'This is a 1:1 thread. Confirm converting it to a group thread.') {
    super(message);
  }
}

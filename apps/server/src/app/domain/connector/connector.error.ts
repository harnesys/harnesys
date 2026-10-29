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

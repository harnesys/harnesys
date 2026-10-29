import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class McpValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class McpServerNotFoundException extends EntityNotFoundException {
  constructor(serverId: string) {
    super(`mcp server ${serverId} not found`, { serverId });
  }
}

import {
  ConflictException,
  EntityNotFoundException,
  HttpException,
  UnauthorizedException,
  ValidationException,
} from '@harnesys/brix';

export class InviteInvalidException extends UnauthorizedException {
  constructor() {
    super('Invite is unknown, expired, or already used');
  }
}

export class InviteNotFoundException extends EntityNotFoundException {
  constructor(inviteId: string) {
    super(`Invite not found: ${inviteId}`, { inviteId });
  }
}

export class NodeNameTakenException extends ConflictException {
  constructor(name: string) {
    super(`Node name already taken: ${name}`, { name });
  }
}

export class NodeNotFoundException extends EntityNotFoundException {
  constructor(nodeId: string) {
    super(`Node not found: ${nodeId}`, { nodeId });
  }
}

export class AlreadyEnrolledException extends ConflictException {
  constructor(orgId: string) {
    super(`Already enrolled for org: ${orgId}`, { orgId });
  }
}

export class NotWorkerOrgException extends ValidationException {
  constructor(orgId: string) {
    super(`Organization is not a worker on this machine: ${orgId}`, { orgId });
  }
}

export class NotRelayOrgException extends ValidationException {
  constructor(orgId: string) {
    super(`Organization is not a relay on this machine: ${orgId}`, { orgId });
  }
}

export class PromoteInvalidException extends UnauthorizedException {
  constructor() {
    super('Promote token is unknown or expired');
  }
}

export class OrgIdRequiredException extends ValidationException {
  constructor() {
    super('X-Org-Id header is required');
  }
}

export class InviteRateLimitedException extends ValidationException {
  constructor() {
    super('Invite rate limit exceeded; try again later');
  }
}

export class CannotRemoveRelayException extends HttpException {
  constructor() {
    super(400, 'CANNOT_REMOVE_RELAY', 'Cannot disconnect or remove the relay node');
  }
}

export class FleetNodeMissingException extends HttpException {
  constructor(nodeId: string) {
    super(404, 'NODE_NOT_FOUND', `Node not found: ${nodeId}`, { nodeId });
  }
}

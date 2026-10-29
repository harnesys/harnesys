import {
  ConflictException,
  EntityNotFoundException,
  HttpException,
  ValidationException,
} from '@harnesys/brix';

export class ContentNotFoundException extends EntityNotFoundException {
  constructor(path: string) {
    super(`Content not found: ${path}`, { path });
  }
}

export class ContentConflictException extends ConflictException {
  constructor(path: string) {
    super(`Content etag mismatch: ${path}`, { path });
  }
}

export class ContentAlreadyExistsException extends ConflictException {
  constructor(path: string) {
    super(`Destination already exists: ${path}`, { path });
  }
}

export class ContentPathEscapeException extends ValidationException {
  constructor(message = 'Path escapes source root') {
    super(message);
  }
}

export class ContentTooLargeException extends ValidationException {
  constructor(size: number, max: number) {
    super(`Content too large: ${size} > ${max}`, { size, max });
  }
}

export class ContentHostNotLocalException extends HttpException {
  constructor(hostId: string) {
    super(503, 'CONTENT_NOT_LOCAL', `Content bytes are not on this host (${hostId})`, { hostId });
  }
}

export class HostOfflineException extends HttpException {
  constructor(hostId: string) {
    super(503, 'HOST_OFFLINE', `Host is offline (${hostId})`, { hostId });
  }
}

export class ContentProxyException extends HttpException {
  constructor(statusCode: number, errorCode: string, message: string, details?: unknown) {
    super(statusCode, errorCode, message, details);
  }
}

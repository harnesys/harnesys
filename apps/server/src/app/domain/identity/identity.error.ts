import { ConflictException, HttpException } from '@harnesys/brix';

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super(401, 'INVALID_CREDENTIALS', 'Login or password is incorrect');
  }
}

export class AccountLockedException extends HttpException {
  constructor(readonly retryAfterSec: number) {
    super(423, 'ACCOUNT_LOCKED', 'Too many failed logins; try again later', { retryAfterSec });
  }
}

export class SessionExpiredException extends HttpException {
  constructor() {
    super(401, 'SESSION_EXPIRED', 'Session is unknown, expired, or revoked');
  }
}

export class SessionReuseException extends HttpException {
  constructor() {
    super(401, 'SESSION_REUSE', 'Refresh token replay detected; the session family was revoked');
  }
}

export class UserInviteInvalidException extends HttpException {
  constructor() {
    super(410, 'INVITE_INVALID', 'Invite is unknown, expired, or already used');
  }
}

export class OwnerAlreadyInitializedException extends ConflictException {
  constructor() {
    super('Owner is already initialized; the users table is not empty');
  }
}

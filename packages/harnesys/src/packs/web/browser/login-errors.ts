export class BrowserLoginDeniedError extends Error {
  readonly code = 'browser_login_not_allowed';

  constructor(credentialId: string, reason: string) {
    super(
      `[browser_login_not_allowed] credential "${credentialId}": ${reason}. Do not retry; tell the user to grant or unlock the website login.`,
    );
    this.name = 'BrowserLoginDeniedError';
  }
}

export class BrowserLoginFailedError extends Error {
  readonly code = 'browser_login_failed';

  constructor(credentialId: string, reason: string) {
    super(
      `[browser_login_failed] credential "${credentialId}": ${reason}. Do not retry automatically; report it to the user.`,
    );
    this.name = 'BrowserLoginFailedError';
  }
}

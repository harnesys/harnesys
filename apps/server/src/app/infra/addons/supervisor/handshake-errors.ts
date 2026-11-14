export class AddonHandlersMismatchError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`addon does not implement required handlers: ${missing.join(', ')}`);
    this.name = new.target.name;
  }
}

export class AddonIdentityMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`addon identity mismatch: expected ${expected}, got ${actual}`);
    this.name = new.target.name;
  }
}

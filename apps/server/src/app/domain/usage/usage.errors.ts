export class UsageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageValidationError';
  }
}

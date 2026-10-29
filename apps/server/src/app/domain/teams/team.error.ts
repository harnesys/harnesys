import { ValidationException } from '@harnesys/brix';

export class TeamValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

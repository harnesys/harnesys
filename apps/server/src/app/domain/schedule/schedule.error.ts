import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ScheduleNotFoundException extends EntityNotFoundException {
  constructor(scheduleId: string) {
    super(`Schedule not found: ${scheduleId}`, { scheduleId });
  }
}

export class ScheduleValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

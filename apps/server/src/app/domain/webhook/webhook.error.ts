import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class WebhookNotFoundException extends EntityNotFoundException {
  constructor(webhookId: string) {
    super(`Webhook not found: ${webhookId}`, { webhookId });
  }
}

export class WebhookValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class HttpException extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

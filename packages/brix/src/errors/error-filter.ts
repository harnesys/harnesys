import { ZodError } from 'zod';
import { Inject } from '../di/inject';
import { Injectable } from '../di/injectable';
import { Logger } from '../logging/logger';
import { DomainException } from './domain-exception';
import { HttpException } from './http-exception';

export const APP_FILTER = 'APP_FILTER';

export interface ErrorResponse {
  statusCode: number;
  errorCode: string;
  message: string;
  path: string;
  timestamp: string;
  traceId?: string;
  details?: unknown;
}

export interface ErrorMappingArgs {
  path: string;
  traceId?: string;
}

export type ErrorMapper = (err: unknown, args: ErrorMappingArgs) => ErrorResponse;

export abstract class ErrorFilter {
  abstract map(err: unknown, args: ErrorMappingArgs): ErrorResponse;
}

const domainStatusByCode: Record<string, number> = {
  ENTITY_NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  UNSUPPORTED_CAPABILITY: 400,
  VOICE_CATALOG_UNSUPPORTED: 404,
  BUSINESS_RULE_VIOLATION: 422,
  BOARD_VALIDATION: 400,
  RULE_VALIDATION: 400,
  STATUS_NOT_EMPTY: 409,
  SOURCE_HOST_MISMATCH: 422,
  SOURCE_MATERIALIZATION_ABSENT: 404,
  SOURCE_MATERIALIZATION_FAILED: 500,
  PRESET_NOT_FOUND: 404,
  PRESET_VALIDATION: 400,
  PRESET_CONFLICT: 409,
  PRESET_IMMUTABLE: 403,
  INTEGRATION_NOT_FOUND: 404,
  INTEGRATION_NOT_CONNECTED: 409,
  INTEGRATION_SCOPE_MISSING: 409,
  INTEGRATION_NOT_CONFIGURED: 500,
  INTEGRATION_GITHUB_APP_NOT_CONFIGURED: 500,
  INTEGRATION_WEBHOOK_SIGNATURE_INVALID: 401,
  INTEGRATION_TOKEN_REFRESH_FAILED: 502,
  INTEGRATION_PROVIDER_ERROR: 502,
};

interface ErrorBodyInput {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
}

function toResponse(
  input: ErrorBodyInput,
  args: { path: string; traceId?: string },
): ErrorResponse {
  const body: ErrorResponse = {
    statusCode: input.statusCode,
    errorCode: input.errorCode,
    message: input.message,
    path: args.path,
    timestamp: new Date().toISOString(),
  };
  if (args.traceId !== undefined) {
    body.traceId = args.traceId;
  }
  if (input.details !== undefined) {
    body.details = input.details;
  }
  return body;
}

function isMappedError(err: unknown): boolean {
  return err instanceof HttpException || err instanceof DomainException || err instanceof ZodError;
}

export function mapToErrorResponse(
  err: unknown,
  args: { path: string; traceId?: string },
): ErrorResponse {
  if (err instanceof HttpException) {
    return toResponse(
      {
        statusCode: err.status,
        errorCode: err.errorCode,
        message: err.message,
        details: err.details,
      },
      args,
    );
  }
  if (err instanceof DomainException) {
    return toResponse(
      {
        statusCode: domainStatusByCode[err.errorCode] ?? 500,
        errorCode: err.errorCode,
        message: err.message,
        details: err.details,
      },
      args,
    );
  }
  if (err instanceof ZodError) {
    return toResponse(
      {
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { issues: err.issues },
      },
      args,
    );
  }
  return toResponse(
    { statusCode: 500, errorCode: 'INTERNAL_ERROR', message: 'Internal Server Error' },
    args,
  );
}

@Injectable()
export class DefaultErrorFilter extends ErrorFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {
    super();
  }

  map(err: unknown, args: ErrorMappingArgs): ErrorResponse {
    if (!isMappedError(err)) {
      this.logger.error({ err, path: args.path, traceId: args.traceId }, 'Unhandled error');
    }
    return mapToErrorResponse(err, args);
  }
}

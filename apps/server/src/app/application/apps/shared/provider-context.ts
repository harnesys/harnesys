import type { Logger } from '@harnesys/brix';
import type { ProviderLogger } from '../../../domain/apps/provider-module.ts';

export function createdProviderLogger(logger: Logger, secrets: readonly string[]): ProviderLogger {
  const known = secrets.filter((secret) => secret.length > 0);
  return {
    info(fields, message) {
      logger.info(redactRecord(fields, known), message);
    },
    warn(fields, message) {
      logger.warn(redactRecord(fields, known), message);
    },
    error(fields, message) {
      logger.error(redactRecord(fields, known), message);
    },
  };
}

function redactRecord(
  fields: Record<string, unknown>,
  secrets: readonly string[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = redactValue(value, secrets, 0);
  }
  return output;
}

function redactValue(value: unknown, secrets: readonly string[], depth: number): unknown {
  if (depth > 4) {
    return '[truncated]';
  }
  if (typeof value === 'string') {
    let output = value.replace(
      /([?&](?:token|code|secret|key|signature)=)[^&\s]+/gi,
      '$1[redacted]',
    );
    for (const secret of secrets) {
      output = output.split(secret).join('[redacted]');
    }
    return output;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, secrets, depth + 1));
  }
  if (value && typeof value === 'object') {
    const inner: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      inner[key] = /authorization|cookie|token|secret|password|api[-_]?key|signature/i.test(key)
        ? '[redacted]'
        : redactValue(entry, secrets, depth + 1);
    }
    return inner;
  }
  return value;
}

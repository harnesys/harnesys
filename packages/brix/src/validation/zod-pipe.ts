import type { ZodType } from 'zod';
import { BadRequestException } from '../errors/http-exception';

export type ValidationWhere = 'body' | 'query';

export function validateWithSchema(
  schema: ZodType | undefined,
  value: unknown,
  where: ValidationWhere,
): unknown {
  if (schema === undefined) {
    return value;
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new BadRequestException(`Validation failed for ${where}`, {
    issues: parsed.error.issues,
  });
}

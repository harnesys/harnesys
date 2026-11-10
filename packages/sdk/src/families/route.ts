import { z } from 'zod';
import { JsonSchemaSubsetSchema, validateInputSchema } from './json-schema.ts';

export const ROUTE_SCHEMA_VERSION = 1;

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteDescriptor {
  id: string;
  method: RouteMethod;
  path: string;
  role?: 'member' | 'admin';
  exposure?: 'org' | 'public';
  bodyLimitKb?: number;
  requestSchema?: Record<string, unknown>;
}

export const RouteDescriptorSchema = z
  .object({
    id: z.string().min(1),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z
      .string()
      .regex(/^\/[A-Za-z0-9/_:.-]*$/, 'path must start with / and use :param segments'),
    role: z.enum(['member', 'admin']).optional(),
    exposure: z.enum(['org', 'public']).optional(),
    bodyLimitKb: z.number().int().positive().optional(),
    requestSchema: JsonSchemaSubsetSchema.optional(),
  })
  .superRefine((descriptor, ctx) => {
    if (descriptor.requestSchema === undefined) {
      return;
    }
    for (const violation of validateInputSchema(descriptor.requestSchema)) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestSchema', violation.path],
        message: `${violation.code}: ${violation.message}`,
      });
    }
  });

export const routeFamily = {
  family: 'route',
  versions: [ROUTE_SCHEMA_VERSION],
  schema: (v: number): z.ZodType => {
    if (v !== ROUTE_SCHEMA_VERSION) {
      throw new Error(`route descriptor schema version ${v} is not supported`);
    }
    return RouteDescriptorSchema;
  },
};

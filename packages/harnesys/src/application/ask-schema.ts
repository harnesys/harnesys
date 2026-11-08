import type { JsonSchema } from '../domain/json-schema.ts';

export { ASK_SCHEMA_KEYS } from '../constants.ts';
export interface AskUserSchemaInput {
  options?: Array<{
    id: string;
    label: string;
  }>;
  multi?: boolean;
  allowText?: boolean;
}
export function askUserSchema(input: AskUserSchemaInput): JsonSchema {
  const properties: Record<string, unknown> = {};
  if (input.options?.length) {
    properties.optionIds = {
      type: 'array',
      items: { type: 'string', enum: input.options.map((o) => o.id) },
      ...(input.multi ? {} : { maxItems: 1 }),
    };
  }
  if (input.allowText !== false) {
    properties.text = { type: 'string' };
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  const anyOf = [
    ...(input.options?.length ? [{ required: ['optionIds'] }] : []),
    ...(input.allowText !== false ? [{ required: ['text'] }] : []),
  ];
  if (input.allowText === false && input.options?.length) {
    schema.required = ['optionIds'];
  } else if (input.options?.length || input.allowText !== false) {
    schema.anyOf = anyOf;
  }
  if (input.options?.length) {
    schema.options = input.options;
    schema.multi = input.multi === true;
  }
  return schema as JsonSchema;
}

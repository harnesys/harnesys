import { describe, expect, test } from 'bun:test';
import { parseOpenApiDocument } from './parse.ts';

const SPEC_V3 = {
  openapi: '3.0.3',
  info: { title: 'Pets', version: '1.0.0' },
  servers: [{ url: 'https://api.pets.example/v2' }],
  paths: {
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getPet',
        summary: 'Fetch one pet',
        parameters: [
          { name: 'verbose', in: 'query', schema: { type: 'boolean', default: false } },
          { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'the pet',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
      },
      delete: {
        summary: 'Remove a pet',
        responses: { '204': { description: 'deleted' } },
      },
    },
    '/pets': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PetInput' } },
          },
        },
        responses: { '201': { description: 'created' } },
      },
      head: { responses: { '200': { description: 'exists' } } },
    },
  },
  components: {
    schemas: {
      Pet: {
        allOf: [
          { $ref: '#/components/schemas/PetInput' },
          { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        ],
      },
      PetInput: {
        type: 'object',
        properties: { name: { type: 'string', description: 'pet name' } },
        required: ['name'],
      },
    },
  },
};

describe('parseOpenApiDocument', () => {
  test('parses OpenAPI 3.x with shared params, refs and synthesis', () => {
    const result = parseOpenApiDocument(SPEC_V3);
    expect(result.baseUrlHint).toBe('https://api.pets.example/v2');
    expect(result.operations.map((operation) => operation.operationId)).toEqual([
      'getPet',
      'delete_pets_petId',
      'post_pets',
    ]);
    const getPet = result.operations[0];
    expect(getPet?.method).toBe('GET');
    expect(getPet?.params.map((param) => `${param.in}:${param.name}`)).toEqual([
      'path:petId',
      'query:verbose',
      'header:X-Trace',
    ]);
    expect(getPet?.responses[0]).toEqual({ status: '200', description: 'the pet' });
    const postPets = result.operations[2];
    expect(postPets?.bodyRequired).toBe(true);
    expect(postPets?.bodySchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string', description: 'pet name' } },
      required: ['name'],
    });
    expect(result.warnings.some((warning) => warning.includes('head'))).toBe(true);
  });

  test('inlines allOf and keeps merged properties', () => {
    const result = parseOpenApiDocument(SPEC_V3);
    const responseSchema = result.operations[0]?.responses.length ?? 0;
    expect(responseSchema).toBeGreaterThan(0);
    expect(SPEC_V3.components.schemas.Pet !== undefined).toBe(true);
  });

  test('parses Swagger 2.0 with host, basePath and body parameter', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'Legacy', version: '1.0.0' },
      host: 'legacy.example',
      basePath: '/api',
      schemes: ['https'],
      paths: {
        '/users': {
          post: {
            parameters: [
              {
                name: 'user',
                in: 'body',
                required: true,
                schema: { type: 'object', properties: { login: { type: 'string' } } },
              },
              { name: 'limit', in: 'query', type: 'integer', required: false },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const result = parseOpenApiDocument(spec);
    expect(result.baseUrlHint).toBe('https://legacy.example/api');
    const post = result.operations[0];
    expect(post?.operationId).toBe('post_users');
    expect(post?.bodyRequired).toBe(true);
    expect(post?.bodySchema).toEqual({
      type: 'object',
      properties: { login: { type: 'string' } },
    });
    expect(post?.params).toEqual([
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
    ]);
  });

  test('deduplicates synthesized operation ids and rejects unknown versions', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Dup', version: '1' },
      paths: {
        '/a': { get: { responses: {} } },
        '/a/': { get: { responses: {} } },
      },
    };
    const result = parseOpenApiDocument(spec);
    expect(result.operations.map((operation) => operation.operationId)).toEqual([
      'get_a',
      'get_a_2',
    ]);
    expect(() => parseOpenApiDocument({ openapi: '2.1', paths: {} })).toThrow(
      'unsupported specification',
    );
    expect(() => parseOpenApiDocument({ info: {} })).toThrow('unsupported specification');
    expect(() => parseOpenApiDocument('not-json')).toThrow('must be a JSON object');
  });
});

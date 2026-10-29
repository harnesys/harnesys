import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { Brix } from '../brix';
import { Injectable } from '../di/injectable';
import { Controller } from '../http/controller';
import { Body, Param, Query } from '../http/params';
import { Get, Post } from '../http/routes';
import { Logger } from '../logging/logger';
import { buildOpenApiDocument, pathParamNames, toOpenApiPath } from './openapi';

@Injectable()
class SilentLogger extends Logger {
  child(): Logger {
    return this;
  }

  info(): void {}

  debug(): void {}

  warn(): void {}

  error(): void {}
}

const CreateBody = z.object({
  name: z.string(),
  slug: z.string().optional(),
});

const ListQuery = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().optional(),
});

@Controller('orgs')
class OrgsController {
  @Get()
  list(@Query(ListQuery) _query: z.infer<typeof ListQuery>): object {
    return {};
  }

  @Post()
  create(@Body(CreateBody) _body: z.infer<typeof CreateBody>): object {
    return {};
  }

  @Get(':id')
  getOne(@Param('id') _id: string): object {
    return {};
  }
}

describe('toOpenApiPath', () => {
  test('rewrites :param segments to {param}', () => {
    expect(toOpenApiPath('/orgs/:orgId/threads/:id')).toBe('/orgs/{orgId}/threads/{id}');
  });
});

describe('pathParamNames', () => {
  test('collects colon params in order', () => {
    expect(pathParamNames('/orgs/:orgId/threads/:id')).toEqual(['orgId', 'id']);
  });
});

describe('buildOpenApiDocument', () => {
  test('emits paths under api base with zod body and query', () => {
    const doc = buildOpenApiDocument({
      info: { title: 'Harnesys', version: '0.1.0' },
      controllers: [OrgsController],
      apiBasePath: '/api/v1',
      extraPaths: [{ method: 'GET', path: '/health/live', summary: 'Liveness' }],
    });

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toEqual({ title: 'Harnesys', version: '0.1.0' });

    const list = doc.paths['/api/v1/orgs']?.get;
    expect(list?.parameters?.some((param) => param.name === 'q' && param.in === 'query')).toBe(
      true,
    );

    const create = doc.paths['/api/v1/orgs']?.post;
    expect(create?.requestBody?.content['application/json']?.schema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
      },
      required: ['name'],
    });
    expect(create?.responses['201']).toBeDefined();

    const one = doc.paths['/api/v1/orgs/{id}']?.get;
    expect(one?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);

    expect(doc.paths['/health/live']?.get?.summary).toBe('Liveness');
  });
});

describe('registerOpenApiRoutes via Brix', () => {
  test('GET /openapi.json includes controller and system paths', async () => {
    @Controller('health')
    class HealthController {
      @Get()
      check(): object {
        return { status: 'ok' };
      }
    }

    const app = Brix.create(
      {
        module: class RootModule {},
        controllers: [HealthController],
        providers: [{ provide: Logger, useClass: SilentLogger }],
      },
      {
        config: {
          preloadedConfig: {
            server: { host: '127.0.0.1', port: 47474, api: { prefix: 'api', version: 'v1' } },
            app: { name: 'Harnesys', version: '0.1.0', description: 'test' },
          },
        },
      },
    );
    const response = await app.getHandler()(new Request('http://localhost/openapi.json'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      openapi: string;
      info: { title: string; version: string; description?: string };
      paths: Record<string, unknown>;
    };
    expect(body.openapi).toBe('3.1.0');
    expect(body.info).toEqual({ title: 'Harnesys', version: '0.1.0', description: 'test' });
    expect(body.paths['/api/v1/health']).toBeDefined();
    expect(body.paths['/health/live']).toBeDefined();
    expect(body.paths['/openapi.json']).toBeDefined();
  });
});

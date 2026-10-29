import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { Controller } from './controller';
import { mapNotFound } from './hono-adapter';
import { Body, Ctx, Param, Query } from './params';
import { Delete, Get, getRouteTable, HttpCode, Patch, Post, Put } from './routes';

@Controller('orgs/:orgId/threads')
class ThreadsController {
  @Get()
  list(
    @Param('orgId') orgId: string,
    @Query() query: Record<string, string>,
    @Ctx() ctx: unknown,
  ): object {
    return { orgId, query, ctx };
  }

  @Post()
  @HttpCode(201)
  create(@Param('orgId') orgId: string, @Body() body: Record<string, unknown>): object {
    return { orgId, body };
  }

  @Get(':id')
  getOne(@Param('orgId') orgId: string, @Param('id') id: string): object {
    return { orgId, id };
  }
}

@Controller('items')
class ItemsController {
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>): object {
    return { id, body };
  }

  @Put(':id')
  replace(@Param() params: Record<string, string>): object {
    return { params };
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): object {
    return { id };
  }
}

describe('getRouteTable', () => {
  test('decorated controller yields exact RouteDef[] with joined prefix + path', () => {
    expect(getRouteTable(ThreadsController)).toEqual([
      {
        method: 'GET',
        path: '/orgs/:orgId/threads',
        handlerName: 'list',
        params: [
          { index: 0, kind: 'param', name: 'orgId' },
          { index: 1, kind: 'query' },
          { index: 2, kind: 'ctx' },
        ],
      },
      {
        method: 'POST',
        path: '/orgs/:orgId/threads',
        handlerName: 'create',
        params: [
          { index: 0, kind: 'param', name: 'orgId' },
          { index: 1, kind: 'body' },
        ],
        httpCode: 201,
      },
      {
        method: 'GET',
        path: '/orgs/:orgId/threads/:id',
        handlerName: 'getOne',
        params: [
          { index: 0, kind: 'param', name: 'orgId' },
          { index: 1, kind: 'param', name: 'id' },
        ],
      },
    ]);
  });

  test('covers Patch/Put/Delete verbs, nameless Param, and method HttpCode', () => {
    expect(getRouteTable(ItemsController)).toEqual([
      {
        method: 'PATCH',
        path: '/items/:id',
        handlerName: 'update',
        params: [
          { index: 0, kind: 'param', name: 'id' },
          { index: 1, kind: 'body' },
        ],
      },
      {
        method: 'PUT',
        path: '/items/:id',
        handlerName: 'replace',
        params: [{ index: 0, kind: 'param' }],
      },
      {
        method: 'DELETE',
        path: '/items/:id',
        handlerName: 'remove',
        params: [{ index: 0, kind: 'param', name: 'id' }],
        httpCode: 204,
      },
    ]);
  });

  test('unknown route is not in the table; mapNotFound returns the 404 contract', () => {
    const table = getRouteTable(ThreadsController);

    expect(table.some((route) => route.path === '/nope')).toBe(false);
    expect(mapNotFound('/nope')).toMatchObject({
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      path: '/nope',
    });
    const body = mapNotFound('/nope');
    expect(typeof body.message).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });
});

import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';
import { createFakeHost, type FakeHttpHandler } from '@harnesys/sdk/testing';
import rawManifest from '../addon.json' with { type: 'json' };
import { addon } from './index.ts';

const TOKEN = 'ntn_test_token';
const BLOCK_ID = 'c02fc1d3db8b45c5a22227595b15aea7';

interface RecordedRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeNotion(
  respond: (req: RecordedRequest) => { status: number; body: unknown },
): FakeHttpHandler {
  return (request: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    const result = respond(request as RecordedRequest);
    return Promise.resolve({
      status: result.status,
      headers: {},
      body: JSON.stringify(result.body),
    });
  };
}

function makeHost(http: FakeHttpHandler): ReturnType<typeof createFakeHost> {
  return createFakeHost({
    definition: addon,
    manifest: parseAddonManifest(rawManifest),
    secrets: { token: TOKEN },
    grants: [{ id: 'http.fetch', scope: { hosts: ['api.notion.com'] } }],
    http,
  });
}

describe('harnesys.notion', () => {
  test('manifest has matching tool handlers', () => {
    const pack = rawManifest.contributions.find((c) => c.family === 'tool-pack');
    const descriptor = pack?.descriptor as { tools: Array<{ name: string }> };
    for (const tool of descriptor.tools) {
      expect(addon.tools?.[tool.name]).toBeFunction();
    }
  });

  test('search returns flattened entries', async () => {
    const host = makeHost(
      fakeNotion(() => ({
        status: 200,
        body: {
          results: [
            {
              object: 'page',
              id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
              url: 'https://notion.so/page',
              properties: {
                Name: { type: 'title', title: [{ plain_text: 'Roadmap' }] },
              },
            },
          ],
          has_more: false,
        },
      })),
    );
    const result = await host.callTool('notion', 'search', { query: 'road' });
    expect(result.output).toEqual({
      results: [
        {
          id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
          type: 'page',
          title: 'Roadmap',
          url: 'https://notion.so/page',
        },
      ],
      hasMore: false,
    });
    host.close();
  });

  test('missing token fails with account_failed', async () => {
    const host = createFakeHost({
      definition: addon,
      manifest: parseAddonManifest(rawManifest),
      secrets: {},
      grants: [{ id: 'http.fetch', scope: { hosts: ['api.notion.com'] } }],
      http: fakeNotion(() => ({ status: 200, body: {} })),
    });
    try {
      await host.callTool('notion', 'search', {});
      expect.unreachable();
    } catch (error) {
      expect((error as { reason?: string }).reason).toBe('account_failed');
    }
    host.close();
  });

  test('get_page_content renders markdown with nesting', async () => {
    const host = makeHost(
      fakeNotion((req) => {
        if (req.url.includes('/children') && req.url.includes('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6')) {
          return {
            status: 200,
            body: {
              results: [
                {
                  object: 'block',
                  id: 'b1',
                  type: 'to_do',
                  has_children: true,
                  to_do: {
                    rich_text: [{ plain_text: 'ship it' }],
                    checked: false,
                  },
                },
              ],
              has_more: false,
            },
          };
        }
        return { status: 200, body: { results: [], has_more: false } };
      }),
    );
    const result = await host.callTool('notion', 'get_page_content', {
      pageId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    });
    expect(result.output).toMatchObject({ markdown: '- [ ] ship it' });
    host.close();
  });

  test('append_blocks converts markdown and posts children', async () => {
    let sentBody: unknown;
    const host = makeHost(
      fakeNotion((req) => {
        if (req.method === 'PATCH') {
          sentBody = JSON.parse(req.body ?? '{}');
        }
        return { status: 200, body: {} };
      }),
    );
    const result = await host.callTool('notion', 'append_blocks', {
      pageId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      content: '# Title\n\n- [x] done\n',
    });
    expect(result.output).toMatchObject({ appended: 2 });
    const body = sentBody as { children: Array<{ type: string }> };
    expect(body.children.map((child) => child.type)).toEqual(['heading_1', 'to_do']);
    host.close();
  });

  test('create_page resolves database title column', async () => {
    let sentBody: unknown;
    const host = makeHost(
      fakeNotion((req) => {
        if (req.url.includes('/databases/') && req.method === 'GET') {
          return {
            status: 200,
            body: {
              properties: {
                Name: { type: 'title' },
                Status: { type: 'select' },
              },
            },
          };
        }
        if (req.method === 'POST') {
          sentBody = JSON.parse(req.body ?? '{}');
          return {
            status: 200,
            body: { id: 'p1', url: 'https://notion.so/p1' },
          };
        }
        return { status: 200, body: {} };
      }),
    );
    const result = await host.callTool('notion', 'create_page', {
      parentType: 'database_id',
      parentId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      title: 'New row',
      properties: { Status: 'In progress' },
    });
    expect(result.output).toMatchObject({ pageId: 'p1' });
    const body = sentBody as {
      properties: Record<string, unknown>;
      parent: Record<string, unknown>;
    };
    expect(body.parent).toEqual({
      database_id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    });
    expect(Object.keys(body.properties)).toContain('Name');
    expect((body.properties.Status as { type: string }).type).toBe('select');
    host.close();
  });

  test('notion 404 maps to not_found', async () => {
    const host = makeHost(
      fakeNotion(() => ({
        status: 404,
        body: { message: 'Could not find page' },
      })),
    );
    try {
      await host.callTool('notion', 'get_page', {
        pageId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      });
      expect.unreachable();
    } catch (error) {
      expect((error as { reason?: string }).reason).toBe('not_found');
    }
    host.close();
  });

  test('query_database passes raw filter through', async () => {
    let sentBody: unknown;
    const host = makeHost(
      fakeNotion((req) => {
        if (req.method === 'POST') {
          sentBody = JSON.parse(req.body ?? '{}');
          return { status: 200, body: { results: [], has_more: false } };
        }
        return { status: 200, body: {} };
      }),
    );
    await host.callTool('notion', 'query_database', {
      databaseId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      filter: { property: 'Status', select: { equals: 'Done' } },
    });
    const body = sentBody as { filter?: unknown };
    expect(body.filter).toEqual({
      property: 'Status',
      select: { equals: 'Done' },
    });
    host.close();
  });

  test('update_block rewrites a to-do and keeps the block type', async () => {
    let sentBody: unknown;
    const host = makeHost(
      fakeNotion((req) => {
        if (req.method === 'GET') {
          return { status: 200, body: { id: BLOCK_ID, type: 'to_do' } };
        }
        if (req.method === 'PATCH') {
          sentBody = JSON.parse(req.body ?? '{}');
        }
        return { status: 200, body: {} };
      }),
    );
    const result = await host.callTool('notion', 'update_block', {
      blockId: BLOCK_ID,
      content: 'ship it',
      checked: true,
    });
    expect(result.output).toEqual({ blockId: BLOCK_ID, type: 'to_do', updated: true });
    expect(sentBody).toEqual({
      to_do: { rich_text: [{ type: 'text', text: { content: 'ship it' } }], checked: true },
    });
    host.close();
  });

  test('update_block refuses a block that cannot hold text', async () => {
    const host = makeHost(
      fakeNotion(() => ({ status: 200, body: { id: BLOCK_ID, type: 'divider' } })),
    );
    try {
      await host.callTool('notion', 'update_block', { blockId: BLOCK_ID, content: 'x' });
      expect.unreachable();
    } catch (error) {
      expect((error as { reason?: string }).reason).toBe('unsupported');
    }
    host.close();
  });

  test('update_block demands something to change', async () => {
    const host = makeHost(
      fakeNotion(() => ({ status: 200, body: { id: BLOCK_ID, type: 'paragraph' } })),
    );
    try {
      await host.callTool('notion', 'update_block', { blockId: BLOCK_ID });
      expect.unreachable();
    } catch (error) {
      expect((error as { reason?: string }).reason).toBe('invalid_params');
    }
    host.close();
  });

  test('delete_block sends DELETE and reports the block', async () => {
    let method: string | undefined;
    const host = makeHost(
      fakeNotion((req) => {
        method = req.method;
        return { status: 200, body: { id: BLOCK_ID, type: 'paragraph' } };
      }),
    );
    const result = await host.callTool('notion', 'delete_block', { blockId: BLOCK_ID });
    expect(result.output).toEqual({ blockId: BLOCK_ID, deleted: true });
    expect(method).toBe('DELETE');
    host.close();
  });
});

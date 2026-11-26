import { describe, expect, test } from 'bun:test';
import { AddonError } from '@harnesys/sdk';
import {
  digestRecords,
  parseJsonBody,
  parseResponseShape,
  projectRecords,
  type ShapingContext,
  saveBodyToFile,
  shapeResponse,
} from './shape.ts';

interface WriteCall {
  path: string;
  data: string;
  append?: boolean;
}

function fakeCtx(threadId?: string): { ctx: ShapingContext; writes: WriteCall[] } {
  const writes: WriteCall[] = [];
  const ctx: ShapingContext = {
    meta: { threadId },
    files: {
      write: async (params: WriteCall) => {
        writes.push(params);
        return { path: params.path.replace('thread:', ''), size: params.data.length };
      },
    },
  };
  return { ctx, writes };
}

function jsonResponse(body: string) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': 'r1' },
    body,
  };
}

describe('parseResponseShape', () => {
  test('returns null when no shaping parameters are present', () => {
    expect(parseResponseShape({ project: 'p', operation: 'o' })).toBeNull();
  });

  test('rejects non-boolean saveToFile', () => {
    expect(() => parseResponseShape({ saveToFile: 'yes' })).toThrow(AddonError);
  });

  test('rejects previewLimit without saveToFile', () => {
    expect(() => parseResponseShape({ previewLimit: 5 })).toThrow(AddonError);
  });

  test('rejects malformed fields', () => {
    expect(() => parseResponseShape({ fields: [] })).toThrow(AddonError);
    expect(() => parseResponseShape({ fields: [1] })).toThrow(AddonError);
  });

  test('parses a valid combination', () => {
    expect(
      parseResponseShape({ saveToFile: true, fields: ['id', 'slug'], previewLimit: 4 }),
    ).toEqual({
      fields: ['id', 'slug'],
      saveToFile: true,
      previewLimit: 4,
    });
  });
});

describe('projectRecords', () => {
  test('projects objects inside arrays and keeps the envelope', () => {
    const body = {
      total: 2,
      data: [
        { id: 1, slug: 'a', big: 'x' },
        { id: 2, name: 'b' },
      ],
    };
    expect(projectRecords(body, ['id', 'slug', 'name'])).toEqual({
      total: 2,
      data: [
        { id: 1, slug: 'a' },
        { id: 2, name: 'b' },
      ],
    });
  });

  test('projects records nested in envelopes', () => {
    const body = { result: { units: [{ id: 1, payload: 'huge' }] } };
    expect(projectRecords(body, ['id'])).toEqual({ result: { units: [{ id: 1 }] } });
  });
});

describe('digestRecords', () => {
  test('finds the root array and slices the preview', () => {
    const digest = digestRecords([{ id: 1 }, { id: 2 }, { id: 3 }], 2, null);
    expect(digest).toEqual({ path: '$', records: 3, preview: [{ id: 1 }, { id: 2 }] });
  });

  test('finds the first object array in breadth-first order', () => {
    const body = { meta: { tags: ['a', 'b'] }, data: { items: [{ id: 1, blob: 'x' }] } };
    const digest = digestRecords(body, 3, ['id']);
    expect(digest?.path).toBe('data.items');
    expect(digest?.records).toBe(1);
    expect(digest?.preview).toEqual([{ id: 1 }]);
  });

  test('returns null when there are no object arrays', () => {
    expect(digestRecords({ total: 1 }, 3, null)).toBeNull();
  });
});

describe('saveBodyToFile', () => {
  test('requires a thread context', async () => {
    const { ctx } = fakeCtx(undefined);
    await expect(saveBodyToFile(ctx, 'findAll', '{"a":1}')).rejects.toThrow(AddonError);
  });

  test('writes base64 chunks under thread:tool-outputs', async () => {
    const { ctx, writes } = fakeCtx('t1');
    const locator = await saveBodyToFile(ctx, 'findAll units', '{"a":1}');
    expect(locator).toMatch(/^thread:tool-outputs\/findAll-units-\d+\.json$/);
    expect(writes).toHaveLength(1);
    const first = writes[0];
    expect(Buffer.from(first?.data ?? '', 'base64').toString('utf8')).toBe('{"a":1}');
  });
});

describe('shapeResponse', () => {
  test('default path keeps the legacy body envelope', async () => {
    const { ctx } = fakeCtx('t1');
    const result = (await shapeResponse(
      ctx,
      'op',
      jsonResponse('{"a":1}'),
      null,
      256 * 1024,
    )) as Record<string, unknown>;
    expect(result).toEqual({
      status: 200,
      contentType: 'application/json',
      responseHeaders: { 'content-type': 'application/json', 'x-request-id': 'r1' },
      body: { a: 1 },
    });
  });

  test('saveToFile returns path, counters and preview without the inline body', async () => {
    const { ctx } = fakeCtx('t1');
    const body = JSON.stringify({ total: 3, data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const shape = parseResponseShape({ saveToFile: true, fields: ['id'] });
    const result = (await shapeResponse(
      ctx,
      'findAll',
      jsonResponse(body),
      shape,
      256 * 1024,
    )) as Record<string, unknown>;
    expect(result.body).toBeUndefined();
    expect(result.savedTo).toMatch(/^thread:tool-outputs\/findAll-\d+\.json$/);
    expect(result.records).toBe(3);
    expect(result.recordsAt).toBe('data');
    expect(result.preview).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(result.bytes).toBe(body.length);
  });

  test('fields projection stays byte-guarded', async () => {
    const { ctx } = fakeCtx('t1');
    const big = 'x'.repeat(4096);
    const body = JSON.stringify([
      { id: 1, blob: big },
      { id: 2, blob: big },
    ]);
    const shape = parseResponseShape({ fields: ['id'] });
    const result = (await shapeResponse(
      ctx,
      'op',
      jsonResponse(body),
      shape,
      256 * 1024,
    )) as Record<string, unknown>;
    expect(result.body).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('parseJsonBody', () => {
  test('returns undefined for non-JSON and empty bodies', () => {
    expect(parseJsonBody('<html/>')).toBeUndefined();
    expect(parseJsonBody('')).toBeUndefined();
    expect(parseJsonBody(null)).toBeUndefined();
  });
});

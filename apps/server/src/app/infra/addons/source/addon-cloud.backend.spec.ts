import { describe, expect, test } from 'bun:test';
import { AddonError, type JsonObject } from '@harnesys/sdk';
import {
  AddonCallPort,
  type SourceRequestMethod,
} from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonCloudBackend, SOURCE_CHUNK_BYTES } from './addon-cloud.backend.ts';

interface RecordedSourceCall {
  method: SourceRequestMethod;
  params: JsonObject;
}

class FakeSourceCalls extends AddonCallPort {
  readonly calls: RecordedSourceCall[] = [];
  readonly content = new TextEncoder().encode('x'.repeat(SOURCE_CHUNK_BYTES + 17));

  async sourceRequest(
    _orgId: string,
    _addonId: string,
    method: SourceRequestMethod,
    params: JsonObject,
  ): Promise<JsonObject> {
    this.calls.push({ method, params });
    if (method === 'source.download' || method === 'source.export') {
      const offset = Number(params.offset ?? 0);
      const length = Number(params.length ?? 0);
      const slice = this.content.slice(offset, offset + length);
      return {
        data: Buffer.from(slice).toString('base64'),
        eof: offset + slice.byteLength >= this.content.byteLength,
      };
    }
    if (method === 'source.list') {
      return params.pageToken === undefined
        ? {
            entries: [{ id: 'f1', name: 'notes.txt', kind: 'file', size: 12 }],
            nextPageToken: 'page-2',
          }
        : { entries: [] };
    }
    if (method === 'source.stat') {
      return { entry: { id: 'f1', name: 'notes.txt', kind: 'file' } };
    }
    if (method === 'source.upload') {
      return { id: 'up-1', name: String(params.name) };
    }
    if (method === 'source.mkdir') {
      return { id: 'dir-1', name: String(params.name) };
    }
    return {};
  }

  override async callTool(): Promise<{ output: unknown }> {
    throw new Error('not used');
  }
  override async callRoute(): Promise<{ status: number }> {
    throw new Error('not used');
  }
  override async triggerStart(): Promise<void> {}
  override async triggerStop(): Promise<void> {}
  override async jobRun(): Promise<void> {}
  override async workerStart(): Promise<void> {}
  override async workerStop(): Promise<void> {}
  override async hookDeliver(): Promise<void> {}
  override async transportSend(): Promise<{ messageId?: string }> {
    return {};
  }
  override async transportEdit(): Promise<void> {}
  override async transportTyping(): Promise<void> {}
}

function backend(): { calls: FakeSourceCalls; drive: AddonCloudBackend } {
  const calls = new FakeSourceCalls();
  const drive = new AddonCloudBackend(calls, {
    orgId: 'org-1',
    addonId: 'acme.drive',
    sourceKindId: 'drive',
    accountId: 'acct-1',
  });
  return { calls, drive };
}

describe('AddonCloudBackend', () => {
  test('downloads a file through chunks and reassembles the bytes', async () => {
    const { calls, drive } = backend();
    const bytes = await drive.download('file-1');
    expect(bytes.byteLength).toBe(calls.content.byteLength);
    expect(Buffer.from(bytes).equals(Buffer.from(calls.content))).toBe(true);
    expect(calls.calls).toHaveLength(2);
    expect(calls.calls[0]?.params.accountId).toBe('acct-1');
    expect(calls.calls[1]?.params.offset).toBe(SOURCE_CHUNK_BYTES);
  });

  test('pages through source.list and maps entries', async () => {
    const { calls, drive } = backend();
    const entries = await drive.listChildren('root');
    expect(entries).toEqual([{ id: 'f1', name: 'notes.txt', kind: 'file', size: 12 }]);
    expect(calls.calls.map((call) => call.params.pageToken)).toEqual([undefined, 'page-2']);
  });

  test('rejects uploads above the single-call limit', async () => {
    const { drive } = backend();
    await expect(
      drive.upload({
        parentId: 'root',
        name: 'big.bin',
        content: new Uint8Array(SOURCE_CHUNK_BYTES + 1),
      }),
    ).rejects.toBeInstanceOf(AddonError);
  });
});

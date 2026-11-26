import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';
import rawManifest from '../addon.json' with { type: 'json' };
import { addon } from './index.ts';

describe('harnesys.openapi manifest', () => {
  test('every declared tool has a handler', () => {
    const manifest = parseAddonManifest(rawManifest);
    for (const contribution of manifest.contributions) {
      if (contribution.family !== 'tool-pack') {
        continue;
      }
      const descriptor = contribution.descriptor as { tools: Array<{ name: string }> };
      for (const tool of descriptor.tools) {
        expect(addon.tools?.[tool.name]).toBeFunction();
      }
    }
  });

  test('grant tools exist and verb tools accept shaping params', () => {
    interface ToolEntry {
      name: string;
      inputSchema: { properties: Record<string, unknown> };
    }
    const pack = rawManifest.contributions.find((c) => c.id === 'api');
    const tools = (pack?.descriptor as { tools: ToolEntry[] }).tools;
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('grants_list');
    expect(names).toContain('grants_grant');
    expect(names).toContain('grants_revoke');
    for (const verb of ['get', 'post', 'put', 'patch', 'delete']) {
      const schema = tools.find((tool) => tool.name === verb)?.inputSchema;
      const props = schema === undefined ? {} : schema.properties;
      expect(Object.keys(props)).toEqual(
        expect.arrayContaining(['fields', 'saveToFile', 'previewLimit']),
      );
    }
  });
});

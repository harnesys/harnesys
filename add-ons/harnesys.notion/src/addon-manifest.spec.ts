import { describe, expect, test } from 'bun:test';
import { parseAddonManifest, validateManifest } from '@harnesys/sdk';
import rawManifest from '../addon.json' with { type: 'json' };
import { addon } from './index.ts';

const manifest = parseAddonManifest(rawManifest);

describe('harnesys.notion manifest', () => {
  test('validates without errors', () => {
    const { violations } = validateManifest(rawManifest);
    expect(violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  test('parses with the expected identity', () => {
    expect(manifest.id).toBe('harnesys.notion');
    expect(manifest.version).toBe('1.0.2');
    expect(manifest.runtime).toEqual({ entry: 'dist/index.js', profile: 'trusted' });
    expect(manifest.activation).toBe('lazy');
    expect(manifest.connections).toEqual([]);
  });

  test('scopes http.fetch to the Notion API', () => {
    const httpFetch = manifest.permissions.find((permission) => permission.id === 'http.fetch');
    expect(httpFetch?.scope).toEqual({ hosts: ['api.notion.com'] });
  });

  test('declares the notion tool pack with a handler for every tool', () => {
    const pack = manifest.contributions.find((contribution) => contribution.family === 'tool-pack');
    if (pack === undefined) {
      throw new Error('tool-pack contribution is missing');
    }
    const descriptor = pack.descriptor as {
      name: string;
      skills?: string[];
      tools: Array<{ name: string }>;
    };
    expect(descriptor.name).toBe('notion');
    expect(descriptor.skills).toEqual(['howto']);
    expect(descriptor.tools.map((tool) => tool.name)).toEqual([
      'search',
      'get_page',
      'get_page_content',
      'create_page',
      'update_page',
      'append_blocks',
      'update_block',
      'delete_block',
      'query_database',
      'get_database',
    ]);
    for (const tool of descriptor.tools) {
      expect(addon.tools?.[tool.name]).toBeFunction();
    }
  });

  test('references the howto content contribution from the pack', () => {
    const content = manifest.contributions.find(
      (contribution) => contribution.family === 'content',
    );
    if (content === undefined) {
      throw new Error('content contribution is missing');
    }
    expect(content.id).toBe('howto');
    expect((content.descriptor as { kind: string }).kind).toBe('skill');
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const VALID_MANIFEST = {
  id: 'harnesys.test-addon',
  version: '1.0.0',
  platform: 1,
  title: 'Test addon',
  description: '%description%',
  runtime: { entry: './dist/index.js', profile: 'restricted' },
  activation: 'lazy',
  permissions: [{ id: 'http.fetch', reason: 'Calls the API on behalf of the organization' }],
  connections: [
    { id: 'cal', label: 'Calendar', accountKinds: ['google-calendar'], cardinality: 'many' },
  ],
  contributions: [
    {
      id: 'pack',
      family: 'tool-pack',
      descriptor: {
        name: 'test',
        title: 'Test tools',
        description: 'test tools',
        connection: 'cal',
        tools: [
          {
            name: 'ping',
            description: 'pings',
            inputSchema: { type: 'object' },
            effect: 'read',
          },
        ],
      },
    },
  ],
};

export function writeAddonPackage(
  root: string,
  manifest: object = VALID_MANIFEST,
  files: Record<string, string> = {},
): string {
  mkdirSync(root, { recursive: true });
  writeFile(root, 'addon.json', JSON.stringify(manifest, null, 2));
  writeFile(root, 'dist/index.js', 'export {};');
  writeFile(root, 'l10n/en.json', JSON.stringify({ description: 'Test addon' }));
  for (const [relativePath, content] of Object.entries(files)) {
    writeFile(root, relativePath, content);
  }
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

import { describe, expect, test } from 'bun:test';
import { parseClaudeMarketplace } from './parse-claude-marketplace.ts';

describe('parseClaudeMarketplace raw entries', () => {
  test('entry keeps raw manifest record with inline components', () => {
    const parsed = parseClaudeMarketplace({
      name: 'demo-marketplace',
      plugins: [
        {
          name: 'ts',
          source: './plugins/ts',
          lspServers: { ts: { command: 'typescript-language-server', args: ['--stdio'] } },
        },
      ],
    });
    const entry = parsed.entries[0];
    expect(entry?.installable).toBe(true);
    expect(entry?.raw).toBeDefined();
    const raw = entry?.raw as Record<string, unknown> | undefined;
    expect(raw?.lspServers).toBeDefined();
  });

  test('raw keeps version and author when present', () => {
    const parsed = parseClaudeMarketplace({
      name: 'demo-marketplace',
      plugins: [{ name: 'ts', version: '1.2.3', author: 'octo', source: './plugins/ts' }],
    });
    const raw = parsed.entries[0]?.raw as Record<string, unknown>;
    expect(raw.version).toBe('1.2.3');
    expect(raw.author).toBe('octo');
  });
});

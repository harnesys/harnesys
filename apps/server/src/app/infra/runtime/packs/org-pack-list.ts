const ORG_PACK_NAMES: readonly string[] = [
  'core',
  'files',
  'image',
  'shell',
  'web',
  'lsp',
  'agents',
  'mcp',
  'plan',
  'threads',
  'scheduler',
  'webhook',
  'issues',
  'manager',
  'google',
  'github',
  'pin-memory',
  'semantic-memory',
  'episodic-memory',
  'knowledge-memory',
  'skills',
];

const HOST_WIRED_PACKS: ReadonlySet<string> = new Set([
  'core',
  'files',
  'image',
  'shell',
  'web',
  'lsp',
  'agents',
  'mcp',
  'plan',
  'threads',
  'scheduler',
  'webhook',
  'issues',
  'manager',
  'google',
  'github',
  'pin-memory',
  'semantic-memory',
  'episodic-memory',
  'knowledge-memory',
  'skills',
]);

export function orgPackNames(): string[] {
  return [...ORG_PACK_NAMES];
}

export function isHostWired(packName: string): boolean {
  return HOST_WIRED_PACKS.has(packName);
}

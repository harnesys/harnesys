/** Platform contribution families; guarded against SDK-registry drift by `addons-platform.spec.ts`. */
export const FAMILY_NAMES = [
  'tool-pack',
  'trigger',
  'job',
  'worker',
  'route',
  'transport',
  'hook',
  'content',
  'config',
  'view',
  'source-kind',
  'mcp',
  'lsp',
  'viewer',
] as const;

import { ensureFileAccess, fileAccessGate } from '../../adapters/actions/file-guard.ts';
import type { LspPort } from '../../ports/lsp.ts';
import type { ToolContext, ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';

function lspRoots(ctx: ToolContext): string[] {
  return ctx.fileAccess ? [ctx.cwd] : ctx.paths.allow;
}

export function createLspTools(lsp: LspPort): ToolDefinition[] {
  return [
    tool('lsp_diagnostics', {
      group: 'lsp',
      description:
        'Language-server diagnostics for a file (errors/warnings). Requires an enabled plugin with lspServers (e.g. typescript-lsp). Line/character are 0-based in other lsp_* tools.',
      operations: ['fs.read'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project cwd' },
        },
        required: ['path'],
      },
      gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
      execute(input, ctx) {
        const parsed = input as {
          path: string;
        };
        ensureFileAccess(ctx, parsed.path, 'read');
        return lsp.diagnostics({ cwd: ctx.cwd, path: parsed.path, roots: lspRoots(ctx) });
      },
    }),
    tool('lsp_definition', {
      group: 'lsp',
      description: 'Go to definition via LSP. line and character are 0-based.',
      operations: ['fs.read'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          line: { type: 'integer', minimum: 0 },
          character: { type: 'integer', minimum: 0 },
        },
        required: ['path', 'line', 'character'],
      },
      gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
      execute(input, ctx) {
        const parsed = input as {
          path: string;
          line: number;
          character: number;
        };
        ensureFileAccess(ctx, parsed.path, 'read');
        return lsp.definition({
          cwd: ctx.cwd,
          path: parsed.path,
          line: parsed.line,
          character: parsed.character,
          roots: lspRoots(ctx),
        });
      },
    }),
    tool('lsp_references', {
      group: 'lsp',
      description: 'Find references via LSP. line and character are 0-based.',
      operations: ['fs.read'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          line: { type: 'integer', minimum: 0 },
          character: { type: 'integer', minimum: 0 },
        },
        required: ['path', 'line', 'character'],
      },
      gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
      execute(input, ctx) {
        const parsed = input as {
          path: string;
          line: number;
          character: number;
        };
        ensureFileAccess(ctx, parsed.path, 'read');
        return lsp.references({
          cwd: ctx.cwd,
          path: parsed.path,
          line: parsed.line,
          character: parsed.character,
          roots: lspRoots(ctx),
        });
      },
    }),
    tool('lsp_hover', {
      group: 'lsp',
      description: 'Hover / type info via LSP. line and character are 0-based.',
      operations: ['fs.read'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          line: { type: 'integer', minimum: 0 },
          character: { type: 'integer', minimum: 0 },
        },
        required: ['path', 'line', 'character'],
      },
      gate: fileAccessGate('read', (input) => (input as { path?: string }).path),
      execute(input, ctx) {
        const parsed = input as {
          path: string;
          line: number;
          character: number;
        };
        ensureFileAccess(ctx, parsed.path, 'read');
        return lsp.hover({
          cwd: ctx.cwd,
          path: parsed.path,
          line: parsed.line,
          character: parsed.character,
          roots: lspRoots(ctx),
        });
      },
    }),
  ];
}

import { isAbsolute, resolve, sep } from 'node:path';
import { Injectable, ValidationException } from '@harnesys/brix';
import { LspPort } from '../../domain/lsp/lsp.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface LspSourceQuery {
  orgId: string;
  sourceId: string;
  path: string;
  line?: number;
  character?: number;
}

@Injectable()
export class LspQueryUseCase {
  constructor(
    private readonly lsp: LspPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machine: MachineConfigPort,
  ) {}

  diagnostics(query: LspSourceQuery): Promise<unknown> {
    const { cwd, absPath } = this.sourcePaths(query);
    return this.lsp.diagnostics(query.orgId, { cwd, path: absPath });
  }

  hover(query: LspSourceQuery): Promise<unknown> {
    const { cwd, absPath } = this.sourcePaths(query);
    return this.lsp.hover(query.orgId, {
      cwd,
      path: absPath,
      line: query.line ?? 0,
      character: query.character ?? 0,
    });
  }

  definition(query: LspSourceQuery): Promise<unknown> {
    const { cwd, absPath } = this.sourcePaths(query);
    return this.lsp.definition(query.orgId, {
      cwd,
      path: absPath,
      line: query.line ?? 0,
      character: query.character ?? 0,
    });
  }

  references(query: LspSourceQuery): Promise<unknown> {
    const { cwd, absPath } = this.sourcePaths(query);
    return this.lsp.references(query.orgId, {
      cwd,
      path: absPath,
      line: query.line ?? 0,
      character: query.character ?? 0,
    });
  }

  sourceRoot(query: Pick<LspSourceQuery, 'orgId' | 'sourceId'>): string {
    const source = this.sources.findById(query.orgId, query.sourceId);
    if (source === null) {
      throw new SourceNotFoundException(query.sourceId);
    }
    return this.sourceLocation.resolve({
      orgId: query.orgId,
      sourceId: query.sourceId,
      hostId: this.machine.get().id,
    }).absoluteRoot;
  }

  private sourcePaths(query: LspSourceQuery): { cwd: string; absPath: string } {
    const root = this.sourceRoot(query);
    const absPath = resolveInsideSource(root, query.path);
    return { cwd: root, absPath };
  }
}

export function resolveInsideSource(root: string, path: string): string {
  const candidate = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const rootReal = resolve(root) + sep;
  if (candidate !== resolve(root) && !candidate.startsWith(rootReal)) {
    throw new ValidationException(`path escapes the source root: ${path}`);
  }
  return candidate;
}

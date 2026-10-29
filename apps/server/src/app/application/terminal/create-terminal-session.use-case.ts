import path from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { TerminalSessionRecord } from '@harnesys/studio-shared';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { TerminalCwdInvalidException } from '../../domain/terminal/terminal.error.ts';
import { TerminalSessionsPort } from '../../domain/terminal/terminal-session.port.ts';

export interface CreateTerminalSessionInput {
  orgId: string;
  projectId: string;
  cwd?: string;
}

@Injectable()
export class CreateTerminalSessionUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machine: MachineConfigPort,
    private readonly sessions: TerminalSessionsPort,
  ) {}

  execute(input: CreateTerminalSessionInput): TerminalSessionRecord {
    const source = this.sources.findById(input.orgId, input.projectId);
    if (!source) {
      throw new SourceNotFoundException(input.projectId);
    }
    const root = this.sourceLocation.resolve({
      orgId: input.orgId,
      sourceId: input.projectId,
      hostId: this.machine.get().id,
    }).absoluteRoot;
    const cwd = resolveTerminalCwd(root, input.cwd);
    return this.sessions.create({ projectId: input.projectId, cwd });
  }
}

export function resolveTerminalCwd(root: string, relativeCwd: string | undefined): string {
  if (!relativeCwd || relativeCwd === '.' || relativeCwd === '') {
    return root;
  }
  const resolved = path.resolve(root, relativeCwd);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    throw new TerminalCwdInvalidException(relativeCwd, normalizedRoot);
  }
  return resolved;
}

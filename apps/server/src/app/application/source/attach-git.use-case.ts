import { basename } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { Source, UiVisibility } from '@harnesys/contracts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { PrepareGitSourceUseCase } from './prepare-git-source.use-case.ts';
import { toPublicSource } from './to-public-source.ts';

export interface AttachGitInput {
  orgId: string;
  url?: string;
  name?: string;
  hostId?: string;
  uiVisibility?: UiVisibility;
  branch?: string;
  credRef?: string;
  integrationId?: string;
  repo?: string;
}

@Injectable()
export class AttachGitUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly prepare: PrepareGitSourceUseCase,
  ) {}

  async execute(input: AttachGitInput): Promise<Source> {
    const vcs = this.resolveVcs(input);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const name = input.name?.trim() || guessNameFromUrl(vcs.remoteUrl) || 'Git';
    const uiVisibility = input.uiVisibility ?? 'org';
    const hostId = input.hostId ?? this.machineConfig.get().id;
    const record = {
      id,
      orgId: input.orgId,
      name,
      description: null,
      distribution: { kind: 'host-bound' as const, hostId },
      uiVisibility,
      managed: false,
      vcs,
      availability: { hostIds: [] },
      lspJson: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sources.insert(record);
    void this.prepare.execute({ orgId: input.orgId, sourceId: id, hostId }).catch(() => undefined);
    return toPublicSource(record);
  }

  private resolveVcs(input: AttachGitInput): {
    engine: 'git';
    remoteUrl: string;
    credRef: string | null;
    defaultBranch: string | null;
    integrationId: string | null;
  } {
    if (input.integrationId) {
      return {
        engine: 'git',
        remoteUrl: githubRemoteUrl(input.repo),
        credRef: null,
        defaultBranch: input.branch?.trim() || null,
        integrationId: input.integrationId,
      };
    }
    const url = input.url?.trim() ?? '';
    if (!url) {
      throw new SourcePathInvalidException('git url is required');
    }
    return {
      engine: 'git',
      remoteUrl: url,
      credRef: input.credRef?.trim() || null,
      defaultBranch: input.branch?.trim() || null,
      integrationId: null,
    };
  }
}

function githubRemoteUrl(repo: string | undefined): string {
  const normalized = (repo ?? '').trim().replace(/\.git$/i, '');
  return `https://github.com/${normalized}.git`;
}

function guessNameFromUrl(url: string): string {
  try {
    const cleaned = url.replace(/\.git$/i, '');
    const parts = cleaned.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      return basename(last);
    }
  } catch {
    // fall through
  }
  return '';
}

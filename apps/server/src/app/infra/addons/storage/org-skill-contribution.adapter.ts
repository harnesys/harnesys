import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@harnesys/brix';
import type { Disposable } from '../../../domain/addons/owner.ts';
import type { ContentContributionRequest } from '../../../domain/content/content-contribution.port.ts';
import { ContentContributionPort } from '../../../domain/content/content-contribution.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { sanitizeSkillName } from '../../../domain/skills/skill-name.ts';

const DIR_MODE = 0o700;

@Injectable()
export class OrgSkillContributionAdapter extends ContentContributionPort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly logger: Logger,
  ) {
    super();
  }

  override register(
    orgId: string,
    addonId: string,
    request: ContentContributionRequest,
  ): Disposable {
    const name = sanitizeSkillName(`addon-${addonId}-${request.skillId}`);
    const root = this.layout.ensureSkillsDir(orgId);
    const skillDir = join(root, name);
    rmSync(skillDir, { recursive: true, force: true });
    mkdirSync(skillDir, { mode: DIR_MODE });
    writeFileSync(join(skillDir, 'SKILL.md'), this.skillMarkdown(name, request), 'utf8');
    this.logger.debug({ orgId, addonId, skill: name }, 'addon skill registered');
    return {
      dispose: () => {
        rmSync(skillDir, { recursive: true, force: true });
      },
    };
  }

  private skillMarkdown(name: string, request: ContentContributionRequest): string {
    return [
      '---',
      `name: ${JSON.stringify(name)}`,
      `description: ${JSON.stringify(request.title.trim())}`,
      '---',
      '',
      this.bodyOf(request).trim(),
      '',
    ].join('\n');
  }

  private bodyOf(request: ContentContributionRequest): string {
    if (!existsSync(request.sourcePath)) {
      this.logger.warn(
        { sourcePath: request.sourcePath, skillId: request.skillId },
        'addon content source missing',
      );
      return '';
    }
    const raw = readFileSync(request.sourcePath, 'utf8');
    return stripFrontmatter(raw);
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) {
    return raw;
  }
  const end = raw.indexOf('\n---', 3);
  return end === -1 ? raw : raw.slice(raw.indexOf('\n', end + 1) + 1);
}

import { Injectable } from '@harnesys/brix';
import type { SourceSkillDir, SourceSkillsScan } from '../../domain/skills/source-skills.port.ts';
import { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';
import { walkSkills } from './skills-walk.ts';

const TTL_MS = 60_000;

interface CacheEntry {
  scan: SourceSkillsScan;
  at: number;
}

@Injectable()
export class SourceSkillsAdapter extends SourceSkillsPort {
  private readonly cache = new Map<string, CacheEntry>();

  async scan(root: string): Promise<SourceSkillsScan> {
    const cached = this.cache.get(root);
    if (cached !== undefined && Date.now() - cached.at < TTL_MS) {
      return cached.scan;
    }
    const walk = await walkSkills(root);
    const skillDirs: SourceSkillDir[] = [];
    for (const candidate of walk.candidates) {
      if (candidate.invalidReason === undefined) {
        skillDirs.push({
          dir: candidate.dir,
          relativePath: candidate.relativePath,
          outsideContainer: candidate.outsideContainer,
        });
      }
    }
    const scan: SourceSkillsScan = { skillDirs, agentMarkdownPaths: walk.agentMarkdownPaths };
    this.cache.set(root, { scan, at: Date.now() });
    return scan;
  }

  invalidate(sourceRoot: string): void {
    this.cache.delete(sourceRoot);
  }
}

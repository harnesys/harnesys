import { SkillsSeedPort } from '../../domain/skills/skills-seed.port.ts';
import type { SeedMarker } from '../../domain/skills/skills-seed.port.ts';
import {
  bundledSkillNames,
  readSeedMarker,
  sha256SkillDir,
  systemSkillUpdateAvailable,
  writeSeedMarker,
} from './system-skills-seed.ts';
import { Injectable } from '@harnesys/brix';

@Injectable()
export class SkillsSeedAdapter extends SkillsSeedPort {
  override readSeedMarker(targetDir: string): SeedMarker | undefined {
    return readSeedMarker(targetDir);
  }

  override writeSeedMarker(targetDir: string, marker: SeedMarker): void {
    writeSeedMarker(targetDir, marker);
  }

  override bundledSkillNames(bundledRoot: string): string[] {
    return bundledSkillNames(bundledRoot);
  }

  override sha256SkillDir(dir: string): string {
    return sha256SkillDir(dir);
  }

  override systemSkillUpdateAvailable(dir: string, marker: SeedMarker, name: string): boolean {
    return systemSkillUpdateAvailable(dir, marker, name);
  }
}

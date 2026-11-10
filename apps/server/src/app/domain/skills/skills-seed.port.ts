export interface SeedSkillEntry {
  bundledHash: string;
  seededAt: string;
  restoredAt?: string;
}

export interface SeedMarker {
  appVersion: string;
  seededAt: string;
  skills: Record<string, SeedSkillEntry>;
}

export abstract class SkillsSeedPort {
  abstract readSeedMarker(targetDir: string): SeedMarker | undefined;
  abstract writeSeedMarker(targetDir: string, marker: SeedMarker): void;
  abstract bundledSkillNames(bundledRoot: string): string[];
  abstract sha256SkillDir(dir: string): string;
  abstract systemSkillUpdateAvailable(dir: string, marker: SeedMarker, name: string): boolean;
}

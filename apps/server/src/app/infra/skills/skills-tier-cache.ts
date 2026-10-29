import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { SkillOrigin } from '@harnesys/contracts';
import type { SkillRegistry, SkillSummary } from 'harnesys';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';

export interface TierEntry {
  summary: SkillSummary;
  origin: SkillOrigin;
  path?: string;
}

@Injectable()
export class SkillsTierCache {
  private readonly registriesByRoot = new Map<string, SkillRegistry>();
  private entriesCache?: Promise<TierEntry[]>;

  constructor(private readonly layout: HostFsLayoutPort) {}

  async entries(): Promise<TierEntry[]> {
    this.entriesCache ??= this.collectEntries();
    return await this.entriesCache;
  }

  registries(): SkillRegistry[] {
    return [
      this.registryFor(this.layout.systemSkillsDir()),
      this.registryFor(this.layout.hostAgentSkillsDir()),
    ];
  }

  invalidate(): void {
    this.registriesByRoot.clear();
    this.entriesCache = undefined;
  }

  private registryFor(root: string): SkillRegistry {
    const cached = this.registriesByRoot.get(root);
    if (cached !== undefined) {
      return cached;
    }
    const registry = new FsSkillRegistry({ roots: [root] });
    this.registriesByRoot.set(root, registry);
    return registry;
  }

  private async collectEntries(): Promise<TierEntry[]> {
    const tiers: Array<{ kind: 'system' | 'host'; root: string }> = [
      { kind: 'system', root: this.layout.systemSkillsDir() },
      { kind: 'host', root: this.layout.hostAgentSkillsDir() },
    ];
    const out: TierEntry[] = [];
    for (const tier of tiers) {
      if (!existsSync(tier.root)) {
        continue;
      }
      const summaries = await this.registryFor(tier.root).list();
      for (const summary of summaries) {
        out.push({
          summary,
          origin: { kind: tier.kind },
          path: join(tier.root, summary.name),
        });
      }
    }
    return out;
  }
}

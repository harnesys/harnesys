import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { SkillRegistry } from 'harnesys';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { TierEntry } from '../../domain/skills/skills-tier-cache.port.ts';
import { SkillsTierCachePort } from '../../domain/skills/skills-tier-cache.port.ts';

@Injectable()
export class SkillsTierCache extends SkillsTierCachePort {
  private readonly registriesByRoot = new Map<string, SkillRegistry>();
  private entriesCache?: Promise<TierEntry[]>;

  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  async entries(): Promise<TierEntry[]> {
    const cached = this.entriesCache ?? this.startCollect();
    return await cached;
  }

  registries(): SkillRegistry[] {
    return [
      this.registryFor(this.layout.systemSkillsDir()),
      this.registryFor(this.layout.hostAgentSkillsDir()),
    ];
  }

  private startCollect(): Promise<TierEntry[]> {
    const pending = this.collectEntries().catch((cause: unknown) => {
      if (this.entriesCache === pending) {
        this.entriesCache = undefined;
      }
      throw cause;
    });
    this.entriesCache = pending;
    return pending;
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

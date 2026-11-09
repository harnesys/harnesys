import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { type AddonManifest, parseAddonManifest } from '@harnesys/sdk';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MONOREPO_ADDONS_DIR } from './addon-paths.ts';

export interface DiscoveredAddon {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly tags: readonly string[];
  readonly entry: string;
  readonly root: string;
  readonly origin: 'monorepo' | 'home';
  readonly manifest: AddonManifest;
}

@Injectable()
export class AddonDiscovery {
  private readonly monorepoAddonsDir: string;

  constructor(private readonly layout: HostFsLayoutPort) {
    this.monorepoAddonsDir = MONOREPO_ADDONS_DIR;
  }

  list(): DiscoveredAddon[] {
    const roots: { dir: string; origin: 'monorepo' | 'home' }[] = [
      { dir: this.monorepoAddonsDir, origin: 'monorepo' },
      { dir: join(this.layout.home(), 'add-ons'), origin: 'home' },
    ];
    const byId = new Map<string, DiscoveredAddon>();
    for (const root of roots) {
      for (const addon of this.scan(root.dir, root.origin)) {
        if (!byId.has(addon.id)) {
          byId.set(addon.id, addon);
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  private scan(root: string, origin: 'monorepo' | 'home'): DiscoveredAddon[] {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      return [];
    }
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
    const found: DiscoveredAddon[] = [];
    for (const dir of dirs) {
      const addon = this.readAddon(dir, origin);
      if (addon) {
        found.push(addon);
      }
    }
    return found;
  }

  private readAddon(root: string, origin: 'monorepo' | 'home'): DiscoveredAddon | undefined {
    const manifestPath = join(root, 'addon.json');
    if (!existsSync(manifestPath)) {
      return undefined;
    }
    try {
      const manifest = parseAddonManifest(
        JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
      );
      return {
        id: manifest.id,
        version: manifest.version,
        title: manifest.title ?? manifest.id,
        description: manifest.description ?? '',
        icon: manifest.icon ?? 'puzzle',
        tags: manifest.tags,
        entry: resolveEntry(root, manifest.entry),
        root,
        origin,
        manifest,
      };
    } catch {
      return undefined;
    }
  }
}

export function resolveEntry(root: string, entry: string): string {
  const resolved = resolve(root, entry);
  const rel = relative(resolve(root), resolved);
  if (rel === '' || rel.startsWith(`..${sep}`)) {
    throw new Error(`addon entry escapes addon root: ${entry}`);
  }
  return resolved;
}

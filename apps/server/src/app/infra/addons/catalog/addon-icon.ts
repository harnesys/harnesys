import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstalledAddonPackage } from '../../../domain/addons/ports/addon-package-catalog.port.ts';

const ASSET_ICON_PREFIX = 'assets/';
const MAX_ICON_SVG_BYTES = 65_536;

function resolveIcon(pkg: InstalledAddonPackage): string | undefined {
  const icon = pkg.manifest.icon;
  if (icon === undefined) {
    return undefined;
  }
  if (!icon.startsWith(ASSET_ICON_PREFIX)) {
    return icon;
  }
  try {
    const svg = readFileSync(join(pkg.root, icon), 'utf8');
    if (Buffer.byteLength(svg) > MAX_ICON_SVG_BYTES) {
      return undefined;
    }
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return undefined;
  }
}

export function addonBranding(pkg: InstalledAddonPackage): { icon?: string; color?: string } {
  const icon = resolveIcon(pkg);
  const { color } = pkg.manifest;
  return {
    ...(icon === undefined ? {} : { icon }),
    ...(color === undefined ? {} : { color }),
  };
}

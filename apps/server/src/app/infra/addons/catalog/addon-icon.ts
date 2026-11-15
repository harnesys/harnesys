import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstalledAddonPackage } from '../../../domain/addons/ports/addon-package-catalog.port.ts';

const ASSET_ICON_PREFIX = 'assets/';
const MAX_ICON_SVG_BYTES = 65_536;

/**
 * Resolves an icon reference (`'assets/icon.svg'` or a lucide name) to what the
 * web UI can render: an inline SVG data URI or the name itself.
 */
export function resolveAddonIconRef(root: string, icon: string | undefined): string | undefined {
  if (icon === undefined) {
    return undefined;
  }
  if (!icon.startsWith(ASSET_ICON_PREFIX)) {
    return icon;
  }
  try {
    const svg = readFileSync(join(root, icon), 'utf8');
    if (Buffer.byteLength(svg) > MAX_ICON_SVG_BYTES) {
      return undefined;
    }
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return undefined;
  }
}

export function addonBranding(pkg: InstalledAddonPackage): { icon?: string; color?: string } {
  const icon = resolveAddonIconRef(pkg.root, pkg.manifest.icon);
  const { color } = pkg.manifest;
  return {
    ...(icon === undefined ? {} : { icon }),
    ...(color === undefined ? {} : { color }),
  };
}

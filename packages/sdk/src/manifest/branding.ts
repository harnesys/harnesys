import { z } from 'zod';

/**
 * Lucide icon name in kebab-case (`'webhook'`, `'calendar-clock'`). Resolved by
 * the web UI against `lucide-react/dynamic`; unknown names fall back to a
 * default icon instead of failing.
 */
export const LucideIconNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'icon must be a lucide icon name in kebab-case');

/**
 * Addon-level icon: either a lucide icon name or an SVG shipped with the
 * package (`'assets/icon.svg'`).
 */
export const AddonIconRefSchema = z
  .string()
  .regex(
    /^(assets\/[a-z0-9][a-z0-9._/-]*\.svg|[a-z][a-z0-9-]*)$/,
    "icon must be a lucide icon name or an 'assets/*.svg' path",
  );

/** Brand color as a 6-digit hex literal (`'#229ED9'`). */
export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB');

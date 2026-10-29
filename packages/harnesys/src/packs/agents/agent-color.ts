import { ENTITY_COLOR_NAMES } from '@harnesys/contracts';

const PALETTE: readonly string[] = ENTITY_COLOR_NAMES;

export function parseAgentColor(raw: unknown): { color?: string; error?: string } {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== 'string') {
    return { error: `color must be one of: ${PALETTE.join(', ')}` };
  }
  const color = raw.trim().toLowerCase();
  if (!PALETTE.includes(color)) {
    return { error: `color must be one of: ${PALETTE.join(', ')}` };
  }
  return { color };
}

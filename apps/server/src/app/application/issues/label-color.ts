import { ENTITY_COLOR_HEX, ENTITY_COLOR_NAMES } from '@harnesys/contracts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';

const LABEL_COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_LABEL_COLOR = '#6b7280';

const NAMED_LABEL_COLORS: Record<string, string> = ENTITY_COLOR_HEX;

export function resolveLabelColor(raw: string | undefined): string {
  const color = raw ?? DEFAULT_LABEL_COLOR;
  if (LABEL_COLOR_HEX.test(color)) {
    return color;
  }
  const named = NAMED_LABEL_COLORS[color.trim().toLowerCase()];
  if (named !== undefined) {
    return named;
  }
  throw new IssueValidationException(
    `invalid label color: ${color} — use hex #RRGGBB or a palette name (${ENTITY_COLOR_NAMES.join(', ')})`,
  );
}

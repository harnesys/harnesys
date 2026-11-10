import { type L10n, resolveL10n } from '@harnesys/sdk';

export function l10nText(value: L10n, locale = 'en'): string {
  return resolveL10n(value, { locale });
}

export function clampTimeoutSec(value: number | undefined, fallback: number, max: number): number {
  return Math.min(value ?? fallback, max) * 1000;
}

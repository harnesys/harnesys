import type { ExprFn } from './types.ts';
import { isPlainObject } from './values.ts';

const FORMAT_KINDS = ['number', 'percent', 'currency', 'date', 'relative'] as const;
type FormatKind = (typeof FORMAT_KINDS)[number];

interface ResolvedFormat {
  kind: FormatKind;
  currency: string;
  digits: number | null;
  locale: string | undefined;
}

const DEFAULT_DIGITS: Record<FormatKind, number | null> = {
  number: 2,
  percent: 1,
  currency: 2,
  date: null,
  relative: null,
};

function isFormatKind(value: unknown): value is FormatKind {
  return typeof value === 'string' && (FORMAT_KINDS as readonly string[]).includes(value);
}

function resolveSpec(spec: unknown): ResolvedFormat | null {
  if (spec === null || spec === undefined) {
    return { kind: 'number', currency: 'USD', digits: DEFAULT_DIGITS.number, locale: undefined };
  }
  if (typeof spec === 'string') {
    const kind: unknown = spec;
    return isFormatKind(kind)
      ? { kind, currency: 'USD', digits: DEFAULT_DIGITS[kind], locale: undefined }
      : null;
  }
  if (!isPlainObject(spec)) {
    return null;
  }
  const kind = spec.kind === undefined ? 'number' : spec.kind;
  if (!isFormatKind(kind)) {
    return null;
  }
  const digits =
    typeof spec.digits === 'number' && Number.isFinite(spec.digits) ? spec.digits : null;
  return {
    kind,
    currency: typeof spec.currency === 'string' && spec.currency !== '' ? spec.currency : 'USD',
    digits: digits ?? DEFAULT_DIGITS[kind],
    locale: typeof spec.locale === 'string' && spec.locale !== '' ? spec.locale : undefined,
  };
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateValue(value: unknown): Date | null {
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 31_536_000_000 },
  { unit: 'month', ms: 2_592_000_000 },
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
  { unit: 'second', ms: 1_000 },
];

function relativeText(date: Date, locale: string | undefined): string {
  const difference = date.getTime() - Date.now();
  const magnitude = Math.abs(difference);
  const chosen = RELATIVE_UNITS.find((entry) => magnitude >= entry.ms) ?? {
    unit: 'second' as const,
    ms: 1_000,
  };
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return format.format(Math.round(difference / chosen.ms), chosen.unit);
}

function formatNumeric(value: unknown, spec: ResolvedFormat): string | null {
  const number = numericValue(value);
  if (number === null) {
    return null;
  }
  if (spec.kind === 'percent') {
    return new Intl.NumberFormat(spec.locale, {
      style: 'percent',
      maximumFractionDigits: spec.digits ?? undefined,
    }).format(number);
  }
  if (spec.kind === 'currency') {
    return new Intl.NumberFormat(spec.locale, {
      style: 'currency',
      currency: spec.currency,
      maximumFractionDigits: spec.digits ?? undefined,
    }).format(number);
  }
  return new Intl.NumberFormat(spec.locale, {
    maximumFractionDigits: spec.digits ?? undefined,
  }).format(number);
}

export const format: ExprFn = (args) => {
  const spec = resolveSpec(args[1]);
  if (spec === null) {
    return null;
  }
  try {
    if (spec.kind === 'date' || spec.kind === 'relative') {
      const date = dateValue(args[0]);
      if (date === null) {
        return null;
      }
      return spec.kind === 'date'
        ? new Intl.DateTimeFormat(spec.locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).format(date)
        : relativeText(date, spec.locale);
    }
    return formatNumeric(args[0], spec);
  } catch {
    return null;
  }
};

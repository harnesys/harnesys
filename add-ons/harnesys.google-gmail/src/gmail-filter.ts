export function parseList(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function labelTerm(label: string): string {
  const cleaned = label.replace(/"/g, '');
  return /\s/.test(cleaned) ? `label:"${cleaned}"` : `label:${cleaned}`;
}

export function effectiveQueryOf(config: Record<string, unknown>): string {
  const raw = typeof config.query === 'string' ? config.query.trim() : '';
  const parts = raw.length > 0 ? [raw] : [];
  for (const label of parseList(config.labels)) {
    parts.push(labelTerm(label));
  }
  return parts.join(' ');
}

export function excludeTermsOf(config: Record<string, unknown>): string[] {
  return parseList(config.exclude).map((term) => term.toLowerCase());
}

export function matchesExclude(terms: string[], text: string): boolean {
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export function gmailDateOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '1970/01/01';
  }
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

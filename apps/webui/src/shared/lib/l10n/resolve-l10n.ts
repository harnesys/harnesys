export type L10n = string | Record<string, string>;

export interface L10nBundles {
  [locale: string]: Record<string, string>;
}

export function resolveL10n(value: L10n, locale: string, bundles?: L10nBundles): string {
  const raw = pickRaw(value, locale);
  if (!bundles) {
    return raw;
  }
  return raw.replace(/%([^%]+)%/g, (token, key: string) => lookup(key, locale, bundles) ?? token);
}

function pickRaw(value: L10n, locale: string): string {
  if (typeof value === 'string') {
    return value;
  }
  return value[locale] ?? value.en ?? '';
}

function lookup(key: string, locale: string, bundles: L10nBundles): string | undefined {
  return bundles[locale]?.[key] ?? bundles.en?.[key];
}

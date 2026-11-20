export function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  pathParams: Record<string, string>,
): string {
  const substituted = pathTemplate.replaceAll(/\{([^{}]+)\}/g, (match, name: string) => {
    const value = pathParams[name];
    return value === undefined ? match : encodeURIComponent(value);
  });
  const base = baseUrl.replaceAll(/\/+$/g, '');
  const path = substituted.startsWith('/') ? substituted : `/${substituted}`;
  return `${base}${path}`;
}

export function withQuery(url: string, query: Record<string, string>): string {
  const entries = Object.entries(query);
  if (entries.length === 0) {
    return url;
  }
  const search = new URLSearchParams(entries).toString();
  return url.includes('?') ? `${url}&${search}` : `${url}?${search}`;
}

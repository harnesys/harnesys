export interface LoginOrigin {
  scheme: string;
  host: string;
  port: string;
}

export function originOf(rawUrl: string): LoginOrigin | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  let port = parsed.port;
  if (port === '') {
    if (parsed.protocol === 'https:') {
      port = '443';
    } else if (parsed.protocol === 'http:') {
      port = '80';
    }
  }
  return {
    scheme: parsed.protocol.replace(/:$/, ''),
    host: parsed.hostname.toLowerCase(),
    port,
  };
}

export function sameOrigin(a: string, b: string): boolean {
  const left = originOf(a);
  const right = originOf(b);
  if (left === null || right === null) {
    return false;
  }
  return left.scheme === right.scheme && left.host === right.host && left.port === right.port;
}

export function isHttps(rawUrl: string): boolean {
  return originOf(rawUrl)?.scheme === 'https';
}

export function matchesSuccessUrl(rawUrl: string, loginUrl: string, pathPrefix: string): boolean {
  if (!sameOrigin(rawUrl, loginUrl)) {
    return false;
  }
  try {
    return new URL(rawUrl).pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

export function originText(rawUrl: string): string {
  const origin = originOf(rawUrl);
  if (origin === null) {
    return '';
  }
  return `${origin.scheme}://${origin.host}`;
}

export function cookieOriginAllowed(cookieDomain: string, loginUrl: string): boolean {
  const origin = originOf(loginUrl);
  if (origin === null) {
    return false;
  }
  const domain = cookieDomain.trim().toLowerCase().replace(/^\./, '').replace(/\.$/, '');
  if (domain === '') {
    return true;
  }
  if (!domain.includes('.') && origin.host !== domain) {
    return false;
  }
  return origin.host === domain || origin.host.endsWith(`.${domain}`);
}

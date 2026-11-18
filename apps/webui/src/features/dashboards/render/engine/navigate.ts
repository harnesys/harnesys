interface InternalRoute {
  ok: true;
  to: string;
}

interface RouteRejection {
  ok: false;
  reason: string;
}

const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const DOT_SEGMENT = /(^|\/)\.{1,2}(?=\/|$)/;

export function internalOrgRoute(raw: unknown, orgRoot: string): InternalRoute | RouteRejection {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'navigate target is empty' };
  }
  const to = raw.trim();
  if (URL_SCHEME_PATTERN.test(to)) {
    return { ok: false, reason: 'navigate target must be an app route, not a URL' };
  }
  if (to.startsWith('//')) {
    return { ok: false, reason: 'navigate target must be an app route, not a host' };
  }
  if (to.includes('\\') || /\s/.test(to)) {
    return { ok: false, reason: 'navigate target contains whitespace or a backslash' };
  }
  if (!to.startsWith('/')) {
    return { ok: false, reason: 'navigate target must be an absolute app path' };
  }
  if (DOT_SEGMENT.test(to)) {
    return { ok: false, reason: 'navigate target contains a relative segment' };
  }
  const root = orgRoot.endsWith('/') ? orgRoot.slice(0, -1) : orgRoot;
  if (root !== '' && to !== root && !to.startsWith(`${root}/`)) {
    return { ok: false, reason: `navigate target must stay inside ${root}` };
  }
  return { ok: true, to };
}

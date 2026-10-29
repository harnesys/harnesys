export function extractBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function orgIdFromRequest(url: URL, orgHeader: string | null): string | null {
  if (orgHeader?.trim()) {
    return orgHeader.trim();
  }
  const match = url.pathname.match(/^\/api\/orgs\/([^/]+)/);
  const id = match?.[1];
  if (!id || id === 'activate') {
    return null;
  }
  return id;
}

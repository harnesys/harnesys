export interface RoutePatternMatch {
  params: Record<string, string>;
}

export function matchRoutePattern(pattern: string, path: string): RoutePatternMatch | null {
  const patternSegments = pattern.split('/').filter((segment) => segment.length > 0);
  const pathSegments = path.split('/').filter((segment) => segment.length > 0);
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];
    if (patternSegment === undefined || pathSegment === undefined) {
      return null;
    }
    if (patternSegment.startsWith(':')) {
      const name = patternSegment.slice(1);
      if (name.length === 0 || pathSegment.length === 0) {
        return null;
      }
      params[name] = pathSegment;
      continue;
    }
    if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return { params };
}

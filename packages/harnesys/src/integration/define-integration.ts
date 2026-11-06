import type { AddonRequest, IntegrationDefinition, IntegrationRoute } from './types.ts';

const INTEGRATION_ID_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

export function defineIntegration(definition: IntegrationDefinition): IntegrationDefinition {
  if (!INTEGRATION_ID_PATTERN.test(definition.id)) {
    throw new Error(`Integration id must be kebab-case: ${definition.id}`);
  }
  if (definition.version.length === 0) {
    throw new Error(`Integration ${definition.id} must declare a version`);
  }
  return definition;
}

export interface ResolvedRoute {
  route: IntegrationRoute;
  request: AddonRequest;
}

export function resolveIntegrationRoute(
  routes: IntegrationRoute[],
  method: string,
  pathname: string,
  query: Record<string, string>,
  body: unknown,
): ResolvedRoute | null {
  const segments = split(pathname);
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const params = matchSegments(split(route.path), segments);
    if (params) {
      return { route, request: { params, query, body } };
    }
  }
  return null;
}

function split(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment.length > 0);
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index] ?? '';
    const value = actual[index] ?? '';
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = value;
      continue;
    }
    if (expected !== value) {
      return null;
    }
  }
  return params;
}

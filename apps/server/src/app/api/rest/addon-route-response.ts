export interface AddonRouteCallResult {
  status: number;
  headers?: Record<string, string> | undefined;
  body?: unknown;
}

/**
 * Maps an add-on route call result to an HTTP Response.
 * String bodies pass through raw with the add-on-provided Content-Type
 * (HTML viewer documents); objects stay JSON.
 */
export function routeResponse(result: AddonRouteCallResult): Response {
  if (typeof result.body === 'string') {
    return new Response(result.body, {
      status: result.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(result.headers ?? {}) },
    });
  }
  return new Response(JSON.stringify(result.body ?? {}), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', ...(result.headers ?? {}) },
  });
}

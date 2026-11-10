import { useEffect, useRef } from 'react';
import { fetchAddonRoute } from '@/shared/api/addons';
import { apiUrl } from '@/shared/api/client';

interface HostRequestBody {
  type?: unknown;
  requestId?: unknown;
  route?: unknown;
  method?: unknown;
  body?: unknown;
}

interface HostResponse {
  type: 'host.response';
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export function isHostRequestAllowed(data: unknown, source: Window | null): boolean {
  return (
    source !== null &&
    typeof data === 'object' &&
    data !== null &&
    (data as HostRequestBody).type === 'host.request' &&
    typeof (data as HostRequestBody).requestId === 'string' &&
    typeof (data as HostRequestBody).route === 'string' &&
    typeof (data as HostRequestBody).method === 'string' &&
    ALLOWED_METHODS.has((data as HostRequestBody).method as string)
  );
}

export function AddonFrameBridge({
  orgId,
  addonId,
  route,
  height = 320,
}: {
  orgId: string;
  addonId: string;
  route: string;
  height?: number;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) {
        return;
      }
      if (!isHostRequestAllowed(event.data, event.source)) {
        return;
      }
      const request = event.data as {
        requestId: string;
        route: string;
        method: string;
        body?: unknown;
      };
      void fetchAddonRoute(
        orgId,
        addonId,
        request.route,
        {},
        {
          method: request.method as 'GET',
          body: request.body,
        },
      )
        .then((result) => {
          respond(frame, { type: 'host.response', requestId: request.requestId, ok: true, result });
        })
        .catch((error: unknown) => {
          respond(frame, {
            type: 'host.response',
            requestId: request.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    };
    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
    };
  }, [addonId, orgId]);

  const src = apiUrl(
    `/api/orgs/${encodeURIComponent(orgId)}/addons/${encodeURIComponent(addonId)}/r${route.startsWith('/') ? route : `/${route}`}`,
  );

  return (
    <iframe
      ref={frameRef}
      src={src}
      sandbox="allow-scripts"
      title={`${addonId} embedded view`}
      className="w-full rounded-md border bg-background"
      style={{ height }}
      data-testid={`addon-frame-${addonId}`}
    />
  );
}

function respond(frame: HTMLIFrameElement, response: HostResponse): void {
  frame.contentWindow?.postMessage(response, '*');
}

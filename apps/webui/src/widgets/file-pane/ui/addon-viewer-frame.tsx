import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isHostRequestAllowed } from '@/features/manage-addons/frame-bridge';
import { markProjectFileDirty } from '@/features/open-file';
import type { AddonViewerView } from '@/shared/api/addon-viewers';
import { fetchAddonRoute, orgAddonRouteUrl } from '@/shared/api/addons';
import { apiUrl } from '@/shared/api/client';
import {
  readProjectFileText,
  sourceFileContentQueryKey,
  writeProjectFileContent,
} from '@/shared/api/files';
import { authenticatedFetch } from '@/shared/api/session';

interface ViewerMessage {
  type?: unknown;
  content?: unknown;
  dirty?: unknown;
  requestId?: unknown;
  route?: unknown;
  method?: unknown;
  body?: unknown;
}

const THEME_VARIABLES = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--border',
  '--input',
  '--muted',
  '--muted-foreground',
  '--primary',
  '--primary-foreground',
  '--accent',
  '--accent-foreground',
  '--ring',
] as const;

interface ViewerTheme {
  dark: boolean;
  colors: Record<string, string>;
}

function readViewerTheme(): ViewerTheme {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const colors: Record<string, string> = {};
  for (const name of THEME_VARIABLES) {
    colors[name] = computed.getPropertyValue(name).trim();
  }
  return { dark: root.classList.contains('dark'), colors };
}

async function loadViewerDocument(orgId: string, viewer: AddonViewerView): Promise<string> {
  const url = apiUrl(orgAddonRouteUrl(orgId, viewer.addonId, viewer.route));
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load viewer document (${String(response.status)})`);
  }
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    return text;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'string' ? parsed : text;
  } catch {
    return text;
  }
}

export function AddonViewerFrame({
  orgId,
  projectId,
  path,
  viewer,
}: {
  orgId: string;
  projectId: string;
  path: string;
  viewer: AddonViewerView;
}) {
  const queryClient = useQueryClient();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const initedRef = useRef(false);

  const contentQuery = useQuery({
    queryKey: sourceFileContentQueryKey(projectId, path),
    queryFn: () => readProjectFileText(projectId, path),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    let url: string | null = null;
    void loadViewerDocument(orgId, viewer)
      .then((html) => {
        url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        setDocUrl(url);
      })
      .catch((error: unknown) => {
        setDocError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    };
  }, [orgId, viewer]);

  const sendInit = useCallback((): void => {
    const content = contentQuery.data;
    if (initedRef.current || !readyRef.current || typeof content !== 'string') {
      return;
    }
    initedRef.current = true;
    frameRef.current?.contentWindow?.postMessage(
      { type: 'viewer.init', path, content, theme: readViewerTheme() },
      window.location.origin,
    );
  }, [contentQuery.data, path]);

  // Handshake: init goes out as soon as BOTH the page is ready and the file content is in.
  useEffect(() => {
    if (contentQuery.isSuccess) {
      sendInit();
    }
  }, [contentQuery.isSuccess, sendInit]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      frameRef.current?.contentWindow?.postMessage(
        { type: 'viewer.theme', theme: readViewerTheme() },
        window.location.origin,
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const sendToFrame = (message: Record<string, unknown>): void => {
      frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
    };
    const listener = (event: MessageEvent) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        typeof event.data !== 'object' ||
        event.data === null
      ) {
        return;
      }
      const data = event.data as ViewerMessage;
      if (data.type === 'viewer.ready') {
        readyRef.current = true;
        sendInit();
        return;
      }
      if (data.type === 'viewer.dirty') {
        markProjectFileDirty(projectId, path, data.dirty === true);
        return;
      }
      if (data.type === 'viewer.save' && typeof data.content === 'string') {
        void writeProjectFileContent(projectId, { path, content: data.content })
          .then(() => {
            queryClient.setQueryData(sourceFileContentQueryKey(projectId, path), data.content);
            markProjectFileDirty(projectId, path, false);
            sendToFrame({ type: 'viewer.saved', ok: true });
          })
          .catch((error: unknown) => {
            sendToFrame({
              type: 'viewer.saved',
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }
      if (isHostRequestAllowed(event.data, event.source)) {
        const request = event.data as {
          requestId: string;
          route: string;
          method: string;
          body?: unknown;
        };
        void fetchAddonRoute(
          orgId,
          viewer.addonId,
          request.route,
          {},
          {
            method: request.method as 'GET',
            body: request.body,
          },
        )
          .then((result) => {
            sendToFrame({ type: 'host.response', requestId: request.requestId, ok: true, result });
          })
          .catch((error: unknown) => {
            sendToFrame({
              type: 'host.response',
              requestId: request.requestId,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    };
    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
    };
  }, [orgId, projectId, path, viewer.addonId, queryClient, sendInit]);

  if (docError !== null) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
        Viewer failed to load: {docError}
      </div>
    );
  }
  if (contentQuery.isError || docUrl === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
      </div>
    );
  }
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="addon-viewer-pane">
      <iframe
        ref={frameRef}
        src={docUrl}
        title={viewer.title}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
      />
    </section>
  );
}

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import type { NodeTicketGrant } from '@/shared/api/node-tickets';
import { requestNodeTicket } from '@/shared/api/node-tickets';
import { hostWsBase } from '@/shared/config/env';
import { cn } from '@/shared/lib/utils';
import '@xterm/xterm/css/xterm.css';

type ServerMessage =
  | {
      type: 'history';
      data: string;
    }
  | {
      type: 'out';
      data: string;
    }
  | {
      type: 'exit';
      code: number | null;
    };
type ClientMessage =
  | {
      type: 'in';
      data: string;
    }
  | {
      type: 'resize';
      cols: number;
      rows: number;
    };

interface TerminalSocketHooks {
  onOpen: () => void;
  onMessage: (data: unknown) => void;
  onFail: (reason: string) => void;
}
function createTerminalSocket(
  url: string,
  isDisposed: () => boolean,
  isExited: () => boolean,
  hooks: TerminalSocketHooks,
): WebSocket {
  const ws = new WebSocket(url);
  ws.onopen = () => {
    if (isDisposed()) {
      return;
    }
    hooks.onOpen();
  };
  ws.onmessage = (event) => {
    if (isDisposed()) {
      return;
    }
    hooks.onMessage(event.data);
  };
  ws.onerror = () => {
    if (isDisposed() || isExited()) {
      return;
    }
    hooks.onFail('Terminal connection failed');
  };
  ws.onclose = () => {
    if (isDisposed() || isExited()) {
      return;
    }
    hooks.onFail('Terminal disconnected');
  };
  return ws;
}
async function openTerminalSocket(args: {
  sessionId: string;
  readOnly: boolean;
  cols: number;
  rows: number;
  isDisposed: () => boolean;
  isExited: () => boolean;
  onTicketError: (message: string) => void;
  hooks: TerminalSocketHooks;
}): Promise<WebSocket | null> {
  let grant: NodeTicketGrant;
  try {
    grant = await requestNodeTicket(args.readOnly ? ['terminal.open:ro'] : ['terminal.open']);
  } catch (err) {
    if (!args.isDisposed()) {
      args.onTicketError(err instanceof Error ? err.message : 'ticket fetch failed');
    }
    return null;
  }
  if (args.isDisposed()) {
    return null;
  }
  const ro = args.readOnly ? '&ro=1' : '';
  const url = `${hostWsBase()}/api/terminals/${encodeURIComponent(args.sessionId)}?cols=${args.cols}&rows=${args.rows}${ro}&ticket=${encodeURIComponent(grant.ticket)}`;
  return createTerminalSocket(url, args.isDisposed, args.isExited, args.hooks);
}
function applyServerMessage(
  term: Terminal,
  raw: unknown,
  onProcessExit: (code: number | null) => void,
): void {
  if (typeof raw !== 'string') {
    return;
  }
  let message: ServerMessage;
  try {
    message = JSON.parse(raw) as ServerMessage;
  } catch {
    return;
  }
  if (message.type === 'history' || message.type === 'out') {
    term.write(message.data);
    return;
  }
  if (message.type === 'exit') {
    onProcessExit(message.code);
  }
}
export function TerminalView({
  sessionId,
  readOnly,
  projectId,
}: {
  sessionId: string;
  readOnly?: boolean;
  projectId?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'exited' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const term = new Terminal({
      cursorBlink: readOnly !== true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#101115',
        foreground: '#e8e8ea',
        cursor: '#e8e8ea',
        selectionBackground: '#3a3a40',
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    let disposed = false;
    let exited = false;
    let ws: WebSocket | null = null;
    const send = (message: ClientMessage) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };
    const onProcessExit = (code: number | null): void => {
      exited = true;
      setStatus('exited');
      term.writeln('');
      term.writeln(`\r\n[Process exited${code === null ? '' : ` with code ${code}`}]`);
    };
    const onSocketOpen = (): void => {
      setStatus('live');
      setError(null);
      fit.fit();
      send({ type: 'resize', cols: term.cols, rows: term.rows });
    };
    const onSocketMessage = (data: unknown): void => {
      applyServerMessage(term, data, onProcessExit);
    };
    const onSocketFail = (reason: string): void => {
      setStatus('error');
      setError(reason);
    };
    const openSocket = async (): Promise<void> => {
      ws = await openTerminalSocket({
        sessionId,
        readOnly: readOnly === true,
        cols: term.cols || 80,
        rows: term.rows || 24,
        isDisposed: () => disposed,
        isExited: () => exited,
        onTicketError: (message) => {
          setStatus('error');
          setError(message);
        },
        hooks: { onOpen: onSocketOpen, onMessage: onSocketMessage, onFail: onSocketFail },
      });
    };
    const dataDisposable = term.onData((data) => {
      if (readOnly !== true) {
        send({ type: 'in', data });
      }
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (readOnly !== true) {
        send({ type: 'resize', cols, rows });
      }
    });
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
    });
    resizeObserver.observe(host);
    void openSocket();
    void projectId;
    return () => {
      disposed = true;
      dataDisposable.dispose();
      resizeDisposable.dispose();
      resizeObserver.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, projectId, readOnly]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="ide-terminal">
      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-2" />
      {status === 'connecting' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          Connecting…
        </div>
      ) : null}
      {status === 'error' ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 border-t bg-destructive/10 px-3 py-2 text-destructive text-xs',
          )}
        >
          {error ?? 'Terminal unavailable'}
        </div>
      ) : null}
    </div>
  );
}

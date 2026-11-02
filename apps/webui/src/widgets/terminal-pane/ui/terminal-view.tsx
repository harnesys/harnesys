import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { useOrgTerminals } from '@/features/desk';
import { ApiError } from '@/shared/api/client';
import type { NodeTicketGrant } from '@/shared/api/node-tickets';
import { requestNodeTicket } from '@/shared/api/node-tickets';
import { hostWsBase } from '@/shared/config/env';
import { cn } from '@/shared/lib/utils';
import { type TerminalConnectionStatus, TerminalStatusBar } from './terminal-status-bar';
import '@xterm/xterm/css/xterm.css';

type ServerMessage =
  | {
      type: 'history';
      data: string;
      truncated: boolean;
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
async function requestTerminalAccess(): Promise<{ ticket: string; readOnly: boolean }> {
  try {
    const grant: NodeTicketGrant = await requestNodeTicket(['terminal.open']);
    return { ticket: grant.ticket, readOnly: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      const grant: NodeTicketGrant = await requestNodeTicket(['terminal.open:ro']);
      return { ticket: grant.ticket, readOnly: true };
    }
    throw error;
  }
}
function applyServerMessage(
  term: Terminal,
  raw: unknown,
  handlers: { onProcessExit: (code: number | null) => void; onTruncated: () => void },
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
  if (message.type === 'history') {
    if (message.truncated) {
      handlers.onTruncated();
    }
    term.write(message.data);
    return;
  }
  if (message.type === 'out') {
    term.write(message.data);
    return;
  }
  if (message.type === 'exit') {
    handlers.onProcessExit(message.code);
  }
}
export function TerminalView({ sessionId, projectId }: { sessionId: string; projectId?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const session = useOrgTerminals().find((item) => item.id === sessionId);
  const [status, setStatus] = useState<TerminalConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [dims, setDims] = useState({ cols: 80, rows: 24 });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const term = new Terminal({
      cursorBlink: true,
      scrollback: 10000,
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
    let readonly = false;
    let ws: WebSocket | null = null;
    const send = (message: ClientMessage) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };
    const onProcessExit = (code: number | null): void => {
      exited = true;
      setStatus('exited');
      setExitCode(code);
      term.writeln('');
      term.writeln(`\r\n[Process exited${code === null ? '' : ` with code ${code}`}]`);
    };
    const onSocketOpen = (): void => {
      setStatus('live');
      setError(null);
      fit.fit();
      setDims({ cols: term.cols, rows: term.rows });
      send({ type: 'resize', cols: term.cols, rows: term.rows });
    };
    const onSocketMessage = (data: unknown): void => {
      applyServerMessage(term, data, { onProcessExit, onTruncated: () => setTruncated(true) });
    };
    const onSocketFail = (reason: string): void => {
      setStatus('error');
      setError(reason);
    };
    const openSocket = async (): Promise<void> => {
      let access: { ticket: string; readOnly: boolean };
      try {
        access = await requestTerminalAccess();
      } catch (err) {
        if (!disposed) {
          setStatus('error');
          setError(err instanceof Error ? err.message : 'ticket fetch failed');
        }
        return;
      }
      if (disposed) {
        return;
      }
      readonly = access.readOnly;
      setReadOnly(readonly);
      if (readonly) {
        term.options.cursorBlink = false;
      }
      const ro = readonly ? '&ro=1' : '';
      const url = `${hostWsBase()}/api/terminals/${encodeURIComponent(sessionId)}?cols=${term.cols || 80}&rows=${term.rows || 24}${ro}&ticket=${encodeURIComponent(access.ticket)}`;
      ws = createTerminalSocket(
        url,
        () => disposed,
        () => exited,
        {
          onOpen: onSocketOpen,
          onMessage: onSocketMessage,
          onFail: onSocketFail,
        },
      );
    };
    const dataDisposable = term.onData((data) => {
      if (!readonly) {
        send({ type: 'in', data });
      }
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      setDims({ cols, rows });
      if (!readonly) {
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
  }, [sessionId, projectId]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="ide-terminal">
      {truncated ? (
        <div
          className="shrink-0 border-border/40 border-b bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground"
          data-testid="terminal-truncated"
        >
          Earlier output was trimmed
        </div>
      ) : null}
      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-2" />
      <TerminalStatusBar
        title={session?.title ?? 'Terminal'}
        origin={session?.origin ?? 'user'}
        cwd={session?.cwd ?? ''}
        status={status}
        exitCode={exitCode}
        readOnly={readOnly}
        cols={dims.cols}
        rows={dims.rows}
        createdAt={session?.createdAt ?? ''}
      />
      {status === 'connecting' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          Connecting...
        </div>
      ) : null}
      {status === 'error' ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-6 border-t bg-destructive/10 px-3 py-2 text-destructive text-xs',
          )}
        >
          {error ?? 'Terminal unavailable'}
        </div>
      ) : null}
    </div>
  );
}

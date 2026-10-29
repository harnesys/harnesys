import type { Container } from '@harnesys/brix';
import type { WSContext } from 'hono/ws';
import {
  NodeTicketAccess,
  ticketCredentialOf,
  type VerifiedNodeTicket,
} from '../../application/identity/node-ticket-access.ts';
import {
  type TerminalDataListener,
  type TerminalExitListener,
  TerminalSessionsPort,
} from '../../domain/terminal/terminal-session.port.ts';
import { upgradeWebSocket } from '../ws/bun-websocket.ts';

type ClientMessage = { type: 'in'; data: string } | { type: 'resize'; cols: number; rows: number };

type ServerMessage =
  | { type: 'history'; data: string }
  | { type: 'out'; data: string }
  | { type: 'exit'; code: number | null };

function rawOf(ws: WSContext): object {
  return (ws as { raw?: object }).raw ?? ws;
}

interface Attachment {
  sessionId: string;
  unsubscribe: () => void;
}

interface HonoLike {
  get(path: string, handler: unknown): unknown;
}

export function registerTerminalWs(app: HonoLike, container: Container): void {
  const sessions = container.resolve<TerminalSessionsPort>(TerminalSessionsPort);
  const tickets = container.resolve<NodeTicketAccess>(NodeTicketAccess);
  const attachments = new WeakMap<object, Attachment>();

  app.get(
    '/api/terminals/:sessionId',
    upgradeWebSocket((c) => {
      const ticket = ticketCredentialOf(c.req.raw);
      const requested = c.req.param('sessionId') ?? '';
      if (!ticket) {
        return rejectedAfterOpen('unauthorized');
      }
      return {
        onOpen: (_evt: unknown, ws: WSContext) => {
          void admit(tickets, ticket, ws, () =>
            attach({
              sessions,
              attachments,
              sessionId: requested,
              ws,
              cols: colsOf(c),
              rows: rowsOf(c),
            }),
          );
        },
        onMessage: (evt: MessageEvent, ws: WSContext) => {
          onMessage(sessions, attachments, ws, evt.data);
        },
        onClose: (_evt: unknown, ws: WSContext) => {
          detach(attachments, ws);
        },
      };
    }),
  );
}

function rejectedAfterOpen(reason: string): {
  onOpen: (evt: unknown, ws: WSContext) => void;
} {
  return {
    onOpen: (_evt: unknown, ws: WSContext) => {
      ws.close(1008, reason);
    },
  };
}

async function admit(
  tickets: NodeTicketAccess,
  ticket: string,
  ws: WSContext,
  next: () => void,
): Promise<void> {
  let verified: VerifiedNodeTicket;
  try {
    verified = await tickets.verify({
      ticket,
      orgId: null,
      requiredActions: ['terminal.open'],
      nowMs: Date.now(),
    });
  } catch {
    ws.close(1008, 'unauthorized');
    return;
  }
  tickets.consume(verified);
  next();
}

function colsOf(c: { req: { query(name: string): string | undefined } }): number {
  return Number(c.req.query('cols') ?? '80');
}

function rowsOf(c: { req: { query(name: string): string | undefined } }): number {
  return Number(c.req.query('rows') ?? '24');
}

function attach(input: {
  sessions: TerminalSessionsPort;
  attachments: WeakMap<object, Attachment>;
  sessionId: string;
  ws: WSContext;
  cols: number;
  rows: number;
}): void {
  const { sessions, attachments, sessionId, ws, cols, rows } = input;
  const session = sessions.get(sessionId);
  if (!session) {
    ws.close(1008, 'terminal session not found');
    return;
  }
  sessions.resize(sessionId, cols, rows);
  const history = sessions.scrollback(sessionId) ?? '';
  if (history.length > 0 && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'history', data: history } satisfies ServerMessage));
  }
  if (session.exited && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'exit', code: session.exitCode } satisfies ServerMessage));
  }
  const onData: TerminalDataListener = (chunk) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'out', data: chunk } satisfies ServerMessage));
    }
  };
  const onExit: TerminalExitListener = (code) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'exit', code } satisfies ServerMessage));
    }
  };
  const unsubscribe = sessions.subscribe(sessionId, onData, onExit);
  if (!unsubscribe) {
    ws.close(1011, 'failed to attach');
    return;
  }
  attachments.set(rawOf(ws), { sessionId, unsubscribe });
}

function onMessage(
  sessions: TerminalSessionsPort,
  attachments: WeakMap<object, Attachment>,
  ws: WSContext,
  data: unknown,
): void {
  const attachment = attachments.get(rawOf(ws));
  if (!attachment || typeof data !== 'string') {
    return;
  }
  let message: ClientMessage;
  try {
    message = JSON.parse(data) as ClientMessage;
  } catch {
    return;
  }
  if (message.type === 'in') {
    if (typeof message.data === 'string') {
      sessions.write(attachment.sessionId, message.data);
    }
    return;
  }
  if (message.type === 'resize') {
    if (typeof message.cols === 'number' && typeof message.rows === 'number') {
      sessions.resize(attachment.sessionId, message.cols, message.rows);
    }
  }
}

function detach(attachments: WeakMap<object, Attachment>, ws: WSContext): void {
  const attachment = attachments.get(rawOf(ws));
  if (!attachment) {
    return;
  }
  attachment.unsubscribe();
  attachments.delete(rawOf(ws));
}

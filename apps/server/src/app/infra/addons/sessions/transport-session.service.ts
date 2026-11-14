import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import { appEchoText, ORIGIN_PREFIX } from '../../../domain/addons/origin.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import type { AddonTransportBindingRow } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportBindingRepositoryPort } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportSessionRepositoryPort } from '../../../domain/addons/ports/transport-session-repository.port.ts';
import type {
  TransportAskReply,
  TransportSessionRow,
} from '../../../domain/addons/transport-session.ts';
import { LocalExecutorPort } from '../../../domain/thread/local-executor.port.ts';
import {
  ThreadEventsPort,
  type ThreadRunEvent,
} from '../../../domain/thread/thread-events.port.ts';
import { TransportAskRegistry } from '../families/transport/transport-ask.registry.ts';
import { TransportSessionAsk } from './transport-session.ask.ts';
import { applyDelta } from './transport-session.draft.ts';
import { bindingOf, TransportSessionDrafts } from './transport-session.drafts.ts';

const STOPPED_SUFFIX = '\n\n[stopped]';
const ERROR_SUFFIX = '\n\n[error] ';
const USER_RELAY_TIMEOUT_MS = 30_000;

interface TerminalEvent {
  kind: 'completed' | 'cancelled' | 'failed';
  message?: string;
}

@Injectable()
export class TransportSessionService {
  private readonly bindingsCache = new Map<string, AddonTransportBindingRow[]>();
  private readonly lastMirrored = new Map<string, string>();
  private readonly chains = new Map<string, Promise<void>>();
  private readonly logger: Logger;
  private unsubscribe: (() => void) | null = null;
  private unregisterAsk: (() => void) | null = null;

  constructor(
    private readonly events: ThreadEventsPort,
    private readonly bindings: AddonTransportBindingRepositoryPort,
    private readonly repo: AddonTransportSessionRepositoryPort,
    private readonly drafts: TransportSessionDrafts,
    private readonly ask: TransportSessionAsk,
    private readonly executor: LocalExecutorPort,
    private readonly askRouting: TransportAskRegistry,
    private readonly calls: AddonCallPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-transport-sessions');
  }

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((orgId, event) => {
      void this.enqueueEvent(orgId, event);
    });
    this.unregisterAsk = this.askRouting.register((reply) => this.tryAnswer(reply));
    void this.resumeOpenSessions();
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unregisterAsk?.();
    this.unsubscribe = null;
    this.unregisterAsk = null;
    this.chains.clear();
    this.drafts.destroy();
    this.bindingsCache.clear();
  }

  /**
   * Frames and their terminal notifications are emitted from the same run
   * through a fire-and-forget subscriber. Handling them concurrently let a
   * late text-delta land after the run was closed, duplicating an already
   * streamed tail and resurrecting the session as `streaming`. Events for one
   * thread are chained so they are applied in emission order.
   */
  private enqueueEvent(orgId: string, event: ThreadRunEvent): Promise<void> {
    const key = `${orgId}/${event.threadId}`;
    const next = (this.chains.get(key) ?? Promise.resolve()).then(() => this.onEvent(orgId, event));
    const tail = next.catch(() => {});
    this.chains.set(key, tail);
    void tail.then(() => {
      if (this.chains.get(key) === tail) {
        this.chains.delete(key);
      }
    });
    return next;
  }

  private async tryAnswer(reply: TransportAskReply): Promise<boolean> {
    return this.ask.tryAnswer(reply);
  }

  private async onEvent(orgId: string, event: ThreadRunEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'events':
          await this.onFrame(orgId, event.threadId, event.events);
          return;
        case 'finished':
          await this.closeRun(
            orgId,
            event.threadId,
            event.runId,
            event.status === 'cancelled' ? STOPPED_SUFFIX : '',
          );
          return;
        case 'failed':
          await this.closeRun(
            orgId,
            event.threadId,
            event.runId,
            `${ERROR_SUFFIX}${event.message}`,
          );
          return;
        case 'parked':
          await this.ask.park(orgId, this.bindingsOf(orgId, event.threadId), event.runId);
          return;
        case 'cleared':
          this.drafts.dropThread(orgId, event.threadId);
          return;
      }
    } catch (error) {
      this.logger.warn(
        { orgId, error: error instanceof Error ? error.message : String(error) },
        'transport session event failed',
      );
    }
  }

  private async onFrame(
    orgId: string,
    threadId: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    const bindings = this.bindingsOf(orgId, threadId);
    if (bindings.length === 0) {
      return;
    }
    for (const event of events) {
      if (event.type === 'user') {
        await this.mirrorUserMessage(orgId, threadId, event, bindings);
        continue;
      }
      if (event.type !== 'text-delta' || event.text === '') {
        continue;
      }
      const runId = event.runId ?? this.drafts.runOfThread(orgId, threadId);
      if (runId === null) {
        continue;
      }
      for (const binding of bindings) {
        await this.drafts.append(orgId, binding, runId, { text: event.text, seq: event.seq });
      }
    }
    const terminal = terminalOf(events);
    if (terminal === null) {
      return;
    }
    const runId = runIdOf(events) ?? this.drafts.runOfThread(orgId, threadId);
    if (runId === null) {
      return;
    }
    await this.closeRun(orgId, threadId, runId, suffixFor(terminal));
  }

  private async closeRun(
    orgId: string,
    threadId: string,
    runId: string,
    suffix: string,
  ): Promise<void> {
    const draft = await this.authoritativeDraft(orgId, runId);
    for (const binding of this.bindingsOf(orgId, threadId)) {
      await this.drafts.close(orgId, binding, runId, suffix, draft ?? undefined);
    }
  }

  private async authoritativeDraft(
    orgId: string,
    runId: string,
  ): Promise<{ text: string; lastSeq: number } | null> {
    try {
      const store = await this.executor.events(orgId);
      const tail = await store.tail(runId, 0);
      let text = '';
      let lastSeq = 0;
      for (const event of tail) {
        if (event.type === 'text-delta' && event.text !== '') {
          text += event.text;
        }
        if (typeof event.seq === 'number' && event.seq > lastSeq) {
          lastSeq = event.seq;
        }
      }
      return text === '' ? null : { text, lastSeq };
    } catch (error) {
      this.logger.warn(
        { orgId, runId, error: error instanceof Error ? error.message : String(error) },
        'transport session draft rebuild failed',
      );
      return null;
    }
  }

  private bindingsOf(orgId: string, threadId: string): AddonTransportBindingRow[] {
    const key = `${orgId}/${threadId}`;
    const cached = this.bindingsCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const rows = this.bindings.findByThread(orgId, threadId);
    if (rows.length > 0) {
      this.bindingsCache.set(key, rows);
    }
    return rows;
  }

  /**
   * Two-way mirror: messages typed in the app reach the bound transports.
   * Messages that arrived through a transport (addon-transport origin or
   * non-app author) are skipped — they are already visible on the other side.
   * The relayed message is remembered as outbound so the transport's own echo
   * never re-enters the thread.
   */
  private async mirrorUserMessage(
    orgId: string,
    threadId: string,
    event: Extract<SessionEvent, { type: 'user' }>,
    bindings: readonly AddonTransportBindingRow[],
  ): Promise<void> {
    if (event.text.trim() === '' || (event.origin ?? '').startsWith(ORIGIN_PREFIX)) {
      return;
    }
    if (event.author !== undefined && event.author.provider !== 'app') {
      return;
    }
    const text =
      event.author === undefined ? event.text : appEchoText(event.author.displayName, event.text);
    const last = this.lastMirrored.get(threadId);
    if (last === text) {
      return;
    }
    this.lastMirrored.set(threadId, text);
    for (const binding of bindings) {
      try {
        const sent = await this.calls.transportSend(
          orgId,
          binding.addonId,
          { channel: binding.externalChatId, text },
          { timeoutMs: USER_RELAY_TIMEOUT_MS },
        );
        if (sent.messageId !== undefined) {
          this.repo.rememberOutbound(orgId, binding.addonId, sent.messageId);
        }
      } catch (error) {
        this.logger.warn(
          {
            orgId,
            addonId: binding.addonId,
            channel: binding.externalChatId,
            error: error instanceof Error ? error.message : String(error),
          },
          'user message relay failed',
        );
      }
    }
  }

  private async resumeOpenSessions(): Promise<void> {
    let rows: TransportSessionRow[];
    try {
      rows = this.repo.listOpen();
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'transport session resume skipped',
      );
      return;
    }
    for (const row of rows) {
      try {
        await this.resumeRow(row);
      } catch (error) {
        this.logger.warn(
          {
            orgId: row.orgId,
            runId: row.runId,
            error: error instanceof Error ? error.message : String(error),
          },
          'transport session resume failed',
        );
      }
    }
  }

  private async resumeRow(row: TransportSessionRow): Promise<void> {
    if (row.status === 'parked') {
      return;
    }
    const store = await this.executor.events(row.orgId);
    const tail = await store.tail(row.runId, row.lastSeq);
    const terminal = terminalOf(tail);
    if (terminal !== null) {
      await this.closeRun(row.orgId, row.threadId, row.runId, suffixFor(terminal));
      return;
    }
    let draft = { text: row.draft, lastSeq: row.lastSeq };
    for (const event of tail) {
      if (event.type === 'text-delta') {
        draft = applyDelta(draft, { text: event.text, seq: event.seq });
      }
    }
    const session = await this.drafts.ensure(row.orgId, bindingOf(row), row.runId);
    session.row.draft = draft.text;
    session.row.lastSeq = draft.lastSeq;
    if (draft.text === '') {
      return;
    }
    await this.drafts.setTyping(row.orgId, session, true);
    this.drafts.schedule(row.orgId, session);
  }
}

function runIdOf(events: readonly SessionEvent[]): string | null {
  for (const event of events) {
    if (typeof event.runId === 'string' && event.runId !== '') {
      return event.runId;
    }
  }
  return null;
}

function terminalOf(events: readonly SessionEvent[]): TerminalEvent | null {
  let found: TerminalEvent | null = null;
  for (const event of events) {
    if (event.type === 'run.completed') {
      found = { kind: 'completed' };
    } else if (event.type === 'run.cancelled') {
      found = { kind: 'cancelled' };
    } else if (event.type === 'run.failed') {
      found = { kind: 'failed', message: event.message };
    }
  }
  return found;
}

function suffixFor(terminal: TerminalEvent): string {
  if (terminal.kind === 'cancelled') {
    return STOPPED_SUFFIX;
  }
  if (terminal.kind === 'failed') {
    return `${ERROR_SUFFIX}${terminal.message ?? 'run failed'}`;
  }
  return '';
}

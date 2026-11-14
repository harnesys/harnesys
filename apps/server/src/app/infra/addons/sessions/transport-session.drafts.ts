import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { AddonCallOptions } from '../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../domain/addons/ports/addon-call.port.ts';
import type { AddonTransportBindingRow } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportSessionRepositoryPort } from '../../../domain/addons/ports/transport-session-repository.port.ts';
import type { TransportSessionRow } from '../../../domain/addons/transport-session.ts';
import { AddonTransportRegistry } from '../families/transport/transport.family.ts';
import { applyDelta, DRAFT_FLUSH_CHARS, renderDraft } from './transport-session.draft.ts';

const FLUSH_INTERVAL_MS = 1_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_FLUSH_FAILURES = 3;
const DEFAULT_MAX_CHARS = 4_096;

export interface LiveSession {
  row: TransportSessionRow;
  flushedLength: number;
  lastSent: string | null;
  typing: boolean;
  failures: number;
  timer: ReturnType<typeof setTimeout> | null;
  queue: Promise<void>;
}

export function sessionKey(
  orgId: string,
  threadId: string,
  runId: string,
  addonId: string,
): string {
  return `${orgId}/${threadId}/${runId}/${addonId}`;
}

@Injectable()
export class TransportSessionDrafts {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly logger: Logger;

  constructor(
    private readonly repo: AddonTransportSessionRepositoryPort,
    private readonly calls: AddonCallPort,
    private readonly transports: AddonTransportRegistry,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-transport-drafts');
  }

  async append(
    orgId: string,
    binding: AddonTransportBindingRow,
    runId: string,
    delta: { text: string; seq?: number },
  ): Promise<void> {
    const session = await this.ensure(orgId, binding, runId);
    const applied = applyDelta(
      { text: session.row.draft, lastSeq: session.row.lastSeq },
      { text: delta.text, seq: delta.seq },
    );
    session.row.draft = applied.text;
    session.row.lastSeq = applied.lastSeq;
    session.row.status = 'streaming';
    session.row.updatedAt = new Date().toISOString();
    await this.setTyping(orgId, session, true);
    if (session.row.draft.length - session.flushedLength >= DRAFT_FLUSH_CHARS) {
      await this.flush(orgId, session);
      return;
    }
    this.schedule(orgId, session);
  }

  async ensure(
    orgId: string,
    binding: AddonTransportBindingRow,
    runId: string,
  ): Promise<LiveSession> {
    const key = sessionKey(orgId, binding.threadId, runId, binding.addonId);
    const live = this.sessions.get(key);
    if (live !== undefined) {
      return live;
    }
    const existing = this.repo.find(orgId, binding.threadId, runId, binding.addonId);
    const now = new Date().toISOString();
    const row: TransportSessionRow = existing ?? {
      orgId,
      addonId: binding.addonId,
      provider: binding.provider,
      externalChatId: binding.externalChatId,
      threadId: binding.threadId,
      runId,
      draft: '',
      lastSeq: 0,
      messageId: null,
      status: 'streaming',
      askId: null,
      askOptionsJson: null,
      createdAt: now,
      updatedAt: now,
    };
    if (existing === null) {
      this.repo.open(row);
    }
    const session: LiveSession = {
      row,
      flushedLength: row.draft.length,
      lastSent: null,
      typing: false,
      failures: 0,
      timer: null,
      queue: Promise.resolve(),
    };
    this.sessions.set(key, session);
    return session;
  }

  peek(orgId: string, threadId: string, runId: string, addonId: string): LiveSession | undefined {
    return this.sessions.get(sessionKey(orgId, threadId, runId, addonId));
  }

  async close(
    orgId: string,
    binding: AddonTransportBindingRow,
    runId: string,
    suffix: string,
    text?: string,
  ): Promise<void> {
    const key = sessionKey(orgId, binding.threadId, runId, binding.addonId);
    const live = this.sessions.get(key);
    const existing = live?.row ?? this.repo.find(orgId, binding.threadId, runId, binding.addonId);
    if (existing === null) {
      return;
    }
    const session = live ?? (await this.ensure(orgId, binding, runId));
    const base = text ?? existing.draft;
    session.row.draft = `${base}${suffix}`;
    await this.flush(orgId, session);
    await this.setTyping(orgId, session, false);
    this.repo.patch(orgId, binding.threadId, runId, binding.addonId, {
      draft: session.row.draft,
      status: 'closed',
      askId: null,
      askOptionsJson: null,
      updatedAt: new Date().toISOString(),
    });
    if (session.timer !== null) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    this.sessions.delete(key);
  }

  async flush(orgId: string, session: LiveSession): Promise<void> {
    session.queue = session.queue.then(async () => {
      if (session.timer !== null) {
        clearTimeout(session.timer);
        session.timer = null;
      }
      const text = renderDraft(session.row.draft, this.maxCharsOf(orgId, session.row.addonId));
      if (text.trim() === '' || text === session.lastSent) {
        return;
      }
      try {
        await this.deliver(orgId, session, text);
        session.lastSent = text;
        session.flushedLength = session.row.draft.length;
        session.failures = 0;
        this.persist(session);
      } catch (error) {
        session.failures += 1;
        this.logger.warn(
          {
            orgId,
            addonId: session.row.addonId,
            runId: session.row.runId,
            failures: session.failures,
            error: error instanceof Error ? error.message : String(error),
          },
          'transport session flush failed',
        );
        if (session.failures >= MAX_FLUSH_FAILURES) {
          await this.close(orgId, bindingOf(session.row), session.row.runId, '');
        }
      }
    });
    await session.queue;
  }

  schedule(orgId: string, session: LiveSession): void {
    if (session.timer !== null) {
      return;
    }
    session.timer = setTimeout(() => {
      session.timer = null;
      void this.flush(orgId, session);
    }, FLUSH_INTERVAL_MS);
  }

  async setTyping(orgId: string, session: LiveSession, on: boolean): Promise<void> {
    if (session.typing === on) {
      return;
    }
    session.typing = on;
    try {
      await this.calls.transportTyping(
        orgId,
        session.row.addonId,
        { channel: session.row.externalChatId, on },
        { timeoutMs: CALL_TIMEOUT_MS },
      );
    } catch (error) {
      this.logger.warn(
        {
          orgId,
          addonId: session.row.addonId,
          error: error instanceof Error ? error.message : String(error),
        },
        'transport typing failed',
      );
    }
  }

  runOfThread(orgId: string, threadId: string): string | null {
    const prefix = `${orgId}/${threadId}/`;
    for (const [key, session] of this.sessions) {
      if (key.startsWith(prefix)) {
        return session.row.runId;
      }
    }
    return null;
  }

  dropThread(orgId: string, threadId: string): void {
    const prefix = `${orgId}/${threadId}/`;
    for (const [key, session] of this.sessions) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      if (session.timer !== null) {
        clearTimeout(session.timer);
        session.timer = null;
      }
      this.sessions.delete(key);
    }
  }

  destroy(): void {
    for (const session of this.sessions.values()) {
      if (session.timer !== null) {
        clearTimeout(session.timer);
        session.timer = null;
      }
    }
    this.sessions.clear();
  }

  private async deliver(orgId: string, session: LiveSession, text: string): Promise<void> {
    const opts: AddonCallOptions = { timeoutMs: CALL_TIMEOUT_MS };
    const { addonId, externalChatId, messageId } = session.row;
    if (messageId === null) {
      const sent = await this.calls.transportSend(
        orgId,
        addonId,
        { channel: externalChatId, text },
        opts,
      );
      if (sent.messageId !== undefined) {
        session.row.messageId = sent.messageId;
        this.repo.rememberOutbound(orgId, addonId, sent.messageId);
      }
      return;
    }
    await this.calls.transportEdit(
      orgId,
      addonId,
      { messageId, message: { channel: externalChatId, text } },
      opts,
    );
  }

  private persist(session: LiveSession): void {
    const { row } = session;
    this.repo.patch(row.orgId, row.threadId, row.runId, row.addonId, {
      draft: row.draft,
      lastSeq: row.lastSeq,
      messageId: row.messageId,
      status: row.status,
      askId: row.askId,
      askOptionsJson: row.askOptionsJson,
      updatedAt: row.updatedAt,
    });
  }

  private maxCharsOf(orgId: string, addonId: string): number {
    return this.transports.find(orgId, addonId)?.capabilities.maxMessageLength ?? DEFAULT_MAX_CHARS;
  }
}

export function bindingOf(row: TransportSessionRow): AddonTransportBindingRow {
  return {
    orgId: row.orgId,
    addonId: row.addonId,
    provider: row.provider,
    externalChatId: row.externalChatId,
    threadId: row.threadId,
    createdAt: row.createdAt,
  };
}

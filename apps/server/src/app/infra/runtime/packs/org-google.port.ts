import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  CapabilityScope,
  GoogleCalendarEvent,
  GoogleCalendarEventInput,
  GoogleCalendarEventPatch,
  GoogleCalendarListQuery,
  GoogleGmailAttachmentDownloadOptions,
  GoogleGmailAttachmentDownloadResult,
  GoogleGmailAttachmentHint,
  GoogleGmailAttachmentMeta,
  GoogleGmailMessage,
  GoogleGmailMessageSummary,
  GoogleGmailSendInput,
  GoogleGmailThread,
  GoogleIntegrationResolution,
  GoogleWorkspacePort,
  ThreadAttachmentPort,
} from 'harnesys';
import { IntegrationScopeMissingException } from '../../../domain/integration/integration.error.ts';
import type { IntegrationRegistryPort } from '../../../domain/integration/integration-registry.port.ts';
import type { IntegrationTokenPort } from '../../../domain/integration/integration-token.port.ts';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  PRIMARY_CALENDAR_ID,
  patchCalendarEvent,
} from '../../integration/google/calendar-api.ts';
import {
  getGmailAttachment,
  getGmailMessage,
  getGmailThread,
  searchGmailMessages,
  sendGmailMessage,
} from '../../integration/google/gmail-api.ts';
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
} from '../../integration/google/google-oauth-device.ts';

export interface OrgGoogleDeps {
  registry: IntegrationRegistryPort;
  tokens: IntegrationTokenPort;
}

export class OrgGooglePort implements GoogleWorkspacePort {
  constructor(
    private readonly deps: OrgGoogleDeps,
    private readonly attachments?: ThreadAttachmentPort,
  ) {}

  resolveIntegration(
    scope: CapabilityScope,
    pinnedIntegrationId?: string,
  ): GoogleIntegrationResolution {
    const connected = this.deps.registry
      .list(scope.orgId)
      .filter((record) => record.provider === 'google');
    if (pinnedIntegrationId !== undefined) {
      const pinned = connected.find((record) => record.id === pinnedIntegrationId);
      return pinned ? { status: 'ready', integrationId: pinned.id } : { status: 'not_found' };
    }
    if (connected.length === 0) {
      return { status: 'not_connected' };
    }
    if (connected.length > 1) {
      return { status: 'ambiguous' };
    }
    const [only] = connected;
    return only ? { status: 'ready', integrationId: only.id } : { status: 'not_connected' };
  }

  async listEvents(
    scope: CapabilityScope,
    integrationId: string,
    query: GoogleCalendarListQuery,
  ): Promise<GoogleCalendarEvent[]> {
    return this.withCalendar(scope.orgId, integrationId, (token) =>
      listCalendarEvents(token, PRIMARY_CALENDAR_ID, query),
    );
  }

  async createEvent(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleCalendarEventInput,
  ): Promise<GoogleCalendarEvent> {
    return this.withCalendar(scope.orgId, integrationId, (token) =>
      createCalendarEvent(token, PRIMARY_CALENDAR_ID, input),
    );
  }

  async updateEvent(
    scope: CapabilityScope,
    integrationId: string,
    eventId: string,
    patch: GoogleCalendarEventPatch,
  ): Promise<GoogleCalendarEvent> {
    return this.withCalendar(scope.orgId, integrationId, (token) =>
      patchCalendarEvent(token, PRIMARY_CALENDAR_ID, eventId, patch),
    );
  }

  async deleteEvent(scope: CapabilityScope, integrationId: string, eventId: string): Promise<void> {
    await this.withCalendar(scope.orgId, integrationId, (token) =>
      deleteCalendarEvent(token, PRIMARY_CALENDAR_ID, eventId),
    );
  }

  searchMessages(
    scope: CapabilityScope,
    integrationId: string,
    query: string,
    maxResults?: number,
  ): Promise<GoogleGmailMessageSummary[]> {
    return this.withGmailRead(scope.orgId, integrationId, (token) =>
      searchGmailMessages(token, query, maxResults),
    );
  }

  readMessage(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
  ): Promise<GoogleGmailMessage> {
    return this.withGmailRead(scope.orgId, integrationId, (token) =>
      getGmailMessage(token, messageId),
    );
  }

  readThread(
    scope: CapabilityScope,
    integrationId: string,
    threadId: string,
  ): Promise<GoogleGmailThread> {
    return this.withGmailRead(scope.orgId, integrationId, (token) =>
      getGmailThread(token, threadId),
    );
  }

  async downloadAttachment(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
    attachmentId: string,
    options?: GoogleGmailAttachmentDownloadOptions,
  ): Promise<GoogleGmailAttachmentDownloadResult> {
    const { bytes, size } = await this.withGmailRead(scope.orgId, integrationId, (token) =>
      getGmailAttachment(token, messageId, attachmentId),
    );
    const known = await this.resolveAttachmentMeta(
      scope,
      integrationId,
      messageId,
      attachmentId,
      options?.meta,
    );
    const savePath = options?.savePath;
    if (savePath !== undefined) {
      const locator = options?.locator;
      if (locator === undefined) {
        throw new Error('savePath download requires a cwd-relative locator');
      }
      await mkdir(dirname(savePath), { recursive: true });
      await writeFile(savePath, bytes);
      return {
        ok: true,
        relPath: locator,
        name: known.filename,
        mediaType: known.mimeType,
        size,
      };
    }
    if (!this.attachments) {
      throw new Error('attachment storage is not wired for the google pack');
    }
    const record = await this.attachments.put(scope, {
      name: known.filename,
      mediaType: known.mimeType,
      bytes,
    });
    return { ...record, size };
  }

  private async resolveAttachmentMeta(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
    attachmentId: string,
    hint?: GoogleGmailAttachmentHint,
  ): Promise<GoogleGmailAttachmentMeta> {
    if (hint && hint.filename !== '' && hint.mimeType !== '') {
      return { attachmentId, filename: hint.filename, mimeType: hint.mimeType, size: 0 };
    }
    const message = await this.withGmailRead(scope.orgId, integrationId, (token) =>
      getGmailMessage(token, messageId),
    );
    const found = message.attachments.find((entry) => entry.attachmentId === attachmentId);
    if (!found) {
      throw new Error(`attachment ${attachmentId} is not part of message ${messageId}`);
    }
    return found;
  }

  sendMessage(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleGmailSendInput,
  ): Promise<{ id: string; threadId: string }> {
    return this.withGmailSend(scope.orgId, integrationId, (token) =>
      sendGmailMessage(token, input),
    );
  }

  private withCalendar<T>(
    orgId: string,
    integrationId: string,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    return this.withScopes(orgId, integrationId, CALENDAR_SCOPES, fn);
  }

  private withGmailRead<T>(
    orgId: string,
    integrationId: string,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    return this.withScopes(orgId, integrationId, GMAIL_READ_SCOPES, fn);
  }

  private withGmailSend<T>(
    orgId: string,
    integrationId: string,
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    return this.withScopes(orgId, integrationId, GMAIL_SEND_SCOPES, fn);
  }

  private async withScopes<T>(
    orgId: string,
    integrationId: string,
    required: readonly string[],
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    let scopes: ReadonlySet<string>;
    try {
      scopes = await this.deps.tokens.getGrantedScopes(orgId, integrationId);
    } catch {
      scopes = new Set<string>();
    }
    const missing = required.filter((scope) => !scopes.has(scope));
    if (missing.length > 0) {
      throw new IntegrationScopeMissingException(orgId, integrationId, missing, RECONNECT_HINT);
    }
    return this.accessToken(orgId, integrationId).then(fn);
  }

  private accessToken(orgId: string, integrationId: string): Promise<string> {
    return this.deps.tokens.getAccessToken(orgId, integrationId);
  }
}

const CALENDAR_SCOPES = [GOOGLE_CALENDAR_SCOPE] as const;
const GMAIL_READ_SCOPES = [GOOGLE_GMAIL_READONLY_SCOPE] as const;
const GMAIL_SEND_SCOPES = [GOOGLE_GMAIL_SEND_SCOPE] as const;
const RECONNECT_HINT =
  'Reconnect the account in Settings → Connectors to grant the missing scopes.';

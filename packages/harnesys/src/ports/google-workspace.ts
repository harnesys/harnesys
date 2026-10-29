import type { CapabilityScope } from '../domain/pack.ts';
import type { ThreadAttachmentRecord } from './thread-attachments.ts';

export type GoogleIntegrationResolutionStatus =
  | 'ready'
  | 'not_connected'
  | 'ambiguous'
  | 'not_found';

export type GoogleIntegrationResolution =
  | { status: 'ready'; integrationId: string }
  | { status: 'not_connected' }
  | { status: 'ambiguous' }
  | { status: 'not_found' };

export interface GoogleCalendarListQuery {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
}

export interface GoogleCalendarEventInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

export interface GoogleCalendarEventPatch {
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  attendees: string[];
  status: string | null;
  htmlLink: string | null;
  updatedAt: string | null;
}

export interface GoogleGmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
}

export interface GoogleGmailAttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GoogleGmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  body: string;
  attachments: GoogleGmailAttachmentMeta[];
}

export interface GoogleGmailThread {
  id: string;
  messages: GoogleGmailMessage[];
}

export interface GoogleGmailSendInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

export interface GoogleGmailAttachmentSaved extends ThreadAttachmentRecord {
  size: number;
}

export interface GoogleGmailAttachmentSavedToFile {
  ok: true;

  relPath: string;
  name: string;
  mediaType: string;
  size: number;
}

export type GoogleGmailAttachmentDownloadResult =
  | GoogleGmailAttachmentSaved
  | GoogleGmailAttachmentSavedToFile;

export interface GoogleGmailAttachmentHint {
  filename: string;
  mimeType: string;
}

export interface GoogleGmailAttachmentDownloadOptions {
  meta?: GoogleGmailAttachmentHint;

  savePath?: string;

  locator?: string;
}

export interface GoogleWorkspacePort {
  resolveIntegration(
    scope: CapabilityScope,
    pinnedIntegrationId?: string,
  ): GoogleIntegrationResolution;
  listEvents(
    scope: CapabilityScope,
    integrationId: string,
    query: GoogleCalendarListQuery,
  ): Promise<GoogleCalendarEvent[]>;
  createEvent(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleCalendarEventInput,
  ): Promise<GoogleCalendarEvent>;
  updateEvent(
    scope: CapabilityScope,
    integrationId: string,
    eventId: string,
    patch: GoogleCalendarEventPatch,
  ): Promise<GoogleCalendarEvent>;
  deleteEvent(scope: CapabilityScope, integrationId: string, eventId: string): Promise<void>;
  searchMessages(
    scope: CapabilityScope,
    integrationId: string,
    query: string,
    maxResults?: number,
  ): Promise<GoogleGmailMessageSummary[]>;
  readMessage(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
  ): Promise<GoogleGmailMessage>;
  readThread(
    scope: CapabilityScope,
    integrationId: string,
    threadId: string,
  ): Promise<GoogleGmailThread>;
  downloadAttachment(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
    attachmentId: string,
    options?: GoogleGmailAttachmentDownloadOptions,
  ): Promise<GoogleGmailAttachmentDownloadResult>;
  sendMessage(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleGmailSendInput,
  ): Promise<{ id: string; threadId: string }>;
}

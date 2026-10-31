import type {
  CapabilityScope,
  GoogleCalendarEvent,
  GoogleCalendarEventInput,
  GoogleCalendarEventPatch,
  GoogleCalendarListQuery,
  GoogleDocsAppendInput,
  GoogleDocsDocument,
  GoogleGmailAttachmentDownloadOptions,
  GoogleGmailAttachmentDownloadResult,
  GoogleGmailMessage,
  GoogleGmailMessageSummary,
  GoogleGmailSendInput,
  GoogleGmailThread,
  GoogleIntegrationResolution,
  GoogleSearchConsoleQueryInput,
  GoogleSearchConsoleRow,
  GoogleSearchConsoleSite,
  GoogleSheetsAppendInput,
  GoogleSheetsMeta,
  GoogleSheetsRange,
  GoogleSheetsWriteInput,
  GoogleWorkspacePort,
  GoogleYoutubeAnalyticsQuery,
  GoogleYoutubeAnalyticsReport,
  GoogleYoutubeChannel,
  GoogleYoutubeCommentThread,
  GoogleYoutubePlaylist,
  GoogleYoutubeReplyInput,
  GoogleYoutubeThumbnailInput,
  GoogleYoutubeUploadInput,
  GoogleYoutubeUploadResult,
  GoogleYoutubeVideo,
  GoogleYoutubeVideoPatch,
  GoogleYoutubeVideoSummary,
  ThreadAttachmentPort,
} from 'harnesys';
import { OrgGoogleDocsSuitePort } from './org-google-docs-suite.port.ts';
import type { OrgGoogleDeps } from './org-google-workspace.port.ts';
import { OrgGoogleWorkspacePort } from './org-google-workspace.port.ts';
import { OrgGoogleYoutubePort } from './org-google-youtube.port.ts';

export type { OrgGoogleDeps } from './org-google-workspace.port.ts';

export class OrgGooglePort extends OrgGoogleWorkspacePort implements GoogleWorkspacePort {
  private readonly youtube: OrgGoogleYoutubePort;
  private readonly docsSuite: OrgGoogleDocsSuitePort;

  constructor(deps: OrgGoogleDeps, attachments?: ThreadAttachmentPort) {
    super(deps, attachments);
    this.youtube = new OrgGoogleYoutubePort(deps);
    this.docsSuite = new OrgGoogleDocsSuitePort(deps);
  }

  override resolveIntegration(
    scope: CapabilityScope,
    pinnedIntegrationId?: string,
  ): GoogleIntegrationResolution {
    return super.resolveIntegration(scope, pinnedIntegrationId);
  }

  override listEvents(
    scope: CapabilityScope,
    integrationId: string,
    query: GoogleCalendarListQuery,
  ): Promise<GoogleCalendarEvent[]> {
    return super.listEvents(scope, integrationId, query);
  }

  override createEvent(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleCalendarEventInput,
  ): Promise<GoogleCalendarEvent> {
    return super.createEvent(scope, integrationId, input);
  }

  override updateEvent(
    scope: CapabilityScope,
    integrationId: string,
    eventId: string,
    patch: GoogleCalendarEventPatch,
  ): Promise<GoogleCalendarEvent> {
    return super.updateEvent(scope, integrationId, eventId, patch);
  }

  override deleteEvent(
    scope: CapabilityScope,
    integrationId: string,
    eventId: string,
  ): Promise<void> {
    return super.deleteEvent(scope, integrationId, eventId);
  }

  override searchMessages(
    scope: CapabilityScope,
    integrationId: string,
    query: string,
    maxResults?: number,
  ): Promise<GoogleGmailMessageSummary[]> {
    return super.searchMessages(scope, integrationId, query, maxResults);
  }

  override readMessage(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
  ): Promise<GoogleGmailMessage> {
    return super.readMessage(scope, integrationId, messageId);
  }

  override readThread(
    scope: CapabilityScope,
    integrationId: string,
    threadId: string,
  ): Promise<GoogleGmailThread> {
    return super.readThread(scope, integrationId, threadId);
  }

  override downloadAttachment(
    scope: CapabilityScope,
    integrationId: string,
    messageId: string,
    attachmentId: string,
    options?: GoogleGmailAttachmentDownloadOptions,
  ): Promise<GoogleGmailAttachmentDownloadResult> {
    return super.downloadAttachment(scope, integrationId, messageId, attachmentId, options);
  }

  override sendMessage(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleGmailSendInput,
  ): Promise<{ id: string; threadId: string }> {
    return super.sendMessage(scope, integrationId, input);
  }

  listChannels(scope: CapabilityScope, integrationId: string): Promise<GoogleYoutubeChannel[]> {
    return this.youtube.listChannels(scope, integrationId);
  }

  listVideos(
    scope: CapabilityScope,
    integrationId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubeVideoSummary[]> {
    return this.youtube.listVideos(scope, integrationId, maxResults);
  }

  getVideo(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
  ): Promise<GoogleYoutubeVideo> {
    return this.youtube.getVideo(scope, integrationId, videoId);
  }

  updateVideo(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    patch: GoogleYoutubeVideoPatch,
  ): Promise<GoogleYoutubeVideo> {
    return this.youtube.updateVideo(scope, integrationId, videoId, patch);
  }

  uploadVideo(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleYoutubeUploadInput,
  ): Promise<GoogleYoutubeUploadResult> {
    return this.youtube.uploadVideo(scope, integrationId, input);
  }

  setThumbnail(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    input: GoogleYoutubeThumbnailInput,
  ): Promise<void> {
    return this.youtube.setThumbnail(scope, integrationId, videoId, input);
  }

  listPlaylists(
    scope: CapabilityScope,
    integrationId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubePlaylist[]> {
    return this.youtube.listPlaylists(scope, integrationId, maxResults);
  }

  addToPlaylist(
    scope: CapabilityScope,
    integrationId: string,
    playlistId: string,
    videoId: string,
  ): Promise<void> {
    return this.youtube.addToPlaylist(scope, integrationId, playlistId, videoId);
  }

  listComments(
    scope: CapabilityScope,
    integrationId: string,
    videoId: string,
    maxResults?: number,
  ): Promise<GoogleYoutubeCommentThread[]> {
    return this.youtube.listComments(scope, integrationId, videoId, maxResults);
  }

  replyToComment(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleYoutubeReplyInput,
  ): Promise<void> {
    return this.youtube.replyToComment(scope, integrationId, input);
  }

  analyticsReport(
    scope: CapabilityScope,
    integrationId: string,
    query: GoogleYoutubeAnalyticsQuery,
  ): Promise<GoogleYoutubeAnalyticsReport> {
    return this.youtube.analyticsReport(scope, integrationId, query);
  }

  getSpreadsheetMeta(
    scope: CapabilityScope,
    integrationId: string,
    spreadsheetId: string,
  ): Promise<GoogleSheetsMeta> {
    return this.docsSuite.getSpreadsheetMeta(scope, integrationId, spreadsheetId);
  }

  readRange(
    scope: CapabilityScope,
    integrationId: string,
    spreadsheetId: string,
    range: string,
  ): Promise<GoogleSheetsRange> {
    return this.docsSuite.readRange(scope, integrationId, spreadsheetId, range);
  }

  writeRange(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSheetsWriteInput,
  ): Promise<void> {
    return this.docsSuite.writeRange(scope, integrationId, input);
  }

  appendRows(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSheetsAppendInput,
  ): Promise<void> {
    return this.docsSuite.appendRows(scope, integrationId, input);
  }

  readDocument(
    scope: CapabilityScope,
    integrationId: string,
    documentId: string,
  ): Promise<GoogleDocsDocument> {
    return this.docsSuite.readDocument(scope, integrationId, documentId);
  }

  appendText(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleDocsAppendInput,
  ): Promise<void> {
    return this.docsSuite.appendText(scope, integrationId, input);
  }

  listSites(scope: CapabilityScope, integrationId: string): Promise<GoogleSearchConsoleSite[]> {
    return this.docsSuite.listSites(scope, integrationId);
  }

  searchAnalytics(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSearchConsoleQueryInput,
  ): Promise<GoogleSearchConsoleRow[]> {
    return this.docsSuite.searchAnalytics(scope, integrationId, input);
  }
}

import { definePack } from '../../domain/pack.ts';
import type {
  GoogleIntegrationResolution,
  GoogleWorkspacePort,
} from '../../ports/google-workspace.ts';
import { createCalendarTools } from './create-calendar-tools.ts';
import { createDocsTools } from './create-docs-tools.ts';
import { createGmailTools } from './create-gmail-tools.ts';
import { createSearchConsoleTools } from './create-searchconsole-tools.ts';
import { createSheetsTools } from './create-sheets-tools.ts';
import { createYoutubeCommunityTools } from './create-youtube-community-tools.ts';
import { createYoutubeTools } from './create-youtube-tools.ts';

export interface GoogleCapabilityPorts {
  google: GoogleWorkspacePort;
}

export interface GooglePackSpec {
  integrationId?: string;
}

const TOOL_META = [
  {
    name: 'calendar_list_events',
    description: 'List Google Calendar events with time-range and text filters.',
  },
  {
    name: 'calendar_create_event',
    description:
      'Create a Google Calendar event (summary, start/end, description, location, attendees).',
  },
  {
    name: 'calendar_update_event',
    description: 'Update fields of a Google Calendar event.',
  },
  { name: 'calendar_delete_event', description: 'Delete a Google Calendar event.' },
  {
    name: 'gmail_search_messages',
    description: 'Search Gmail with Gmail search syntax; returns snippets and headers.',
  },
  {
    name: 'gmail_read_message',
    description: 'Read one Gmail message: headers, text/plain body, and attachments list.',
  },
  {
    name: 'gmail_read_thread',
    description: 'Read a Gmail thread: all messages with headers, bodies, and attachments lists.',
  },
  {
    name: 'gmail_download_attachment',
    description:
      'Download a Gmail attachment: attach it to the chat, or write it into the workspace via savePath.',
  },
  {
    name: 'gmail_send_message',
    description: 'Send a plain-text email from the connected account.',
  },
  {
    name: 'youtube_list_channels',
    description: 'List YouTube channels of the connected account with counts.',
  },
  {
    name: 'youtube_list_videos',
    description: 'List recent uploads of the connected YouTube channel with stats.',
  },
  {
    name: 'youtube_video_details',
    description: 'Read full metadata and statistics of one YouTube video.',
  },
  {
    name: 'youtube_update_video',
    description: 'Update title/description/tags/category/privacy of an owned YouTube video.',
  },
  {
    name: 'youtube_upload_video',
    description: 'Upload a video file from the workspace to YouTube (resumable upload).',
  },
  {
    name: 'youtube_set_thumbnail',
    description: 'Set a custom JPEG/PNG thumbnail for an owned YouTube video.',
  },
  {
    name: 'youtube_list_playlists',
    description: 'List playlists of the connected YouTube channel.',
  },
  {
    name: 'youtube_add_to_playlist',
    description: 'Add a video to a YouTube playlist of the connected channel.',
  },
  {
    name: 'youtube_list_comments',
    description: 'List viewer comments on a YouTube video.',
  },
  {
    name: 'youtube_reply_to_comment',
    description: 'Post a reply to a YouTube comment as the connected channel.',
  },
  {
    name: 'youtube_analytics_report',
    description: 'Query YouTube Analytics: views, watch time, subscribers, traffic.',
  },
  {
    name: 'sheets_list_tabs',
    description: 'List tabs of a Google Sheets spreadsheet.',
  },
  {
    name: 'sheets_read_range',
    description: 'Read an A1 range from a Google Sheets spreadsheet.',
  },
  {
    name: 'sheets_write_range',
    description: 'Overwrite an A1 range in a Google Sheets spreadsheet.',
  },
  {
    name: 'sheets_append_rows',
    description: 'Append rows to a table in a Google Sheets spreadsheet.',
  },
  {
    name: 'docs_read_document',
    description: 'Read a Google Docs document as plain text.',
  },
  {
    name: 'docs_append_text',
    description: 'Append a text block to the end of a Google Docs document.',
  },
  {
    name: 'gsc_list_sites',
    description: 'List Search Console sites accessible by the connected account.',
  },
  {
    name: 'gsc_search_analytics',
    description: 'Query Search Console search analytics: clicks, impressions, CTR, position.',
  },
];

export const googleCapability = definePack<GoogleCapabilityPorts, GooglePackSpec>({
  name: 'google',
  version: '1.0.0',
  description:
    'Google Workspace: calendar_list_events / calendar_create_event / calendar_update_event / calendar_delete_event / gmail_search_messages / gmail_read_message / gmail_read_thread / gmail_download_attachment / gmail_send_message / youtube_list_channels / youtube_list_videos / youtube_video_details / youtube_update_video / youtube_upload_video / youtube_set_thumbnail / youtube_list_playlists / youtube_add_to_playlist / youtube_list_comments / youtube_reply_to_comment / youtube_analytics_report / sheets_list_tabs / sheets_read_range / sheets_write_range / sheets_append_rows / docs_read_document / docs_append_text / gsc_list_sites / gsc_search_analytics',
  icon: 'google',
  specSchema: {
    type: 'object',
    properties: {
      integrationId: {
        type: 'string',
        description: 'Integration to use when several Google accounts are connected',
      },
    },
    additionalProperties: false,
  },
  meta: {
    tools: TOOL_META,
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => {
    const pinned =
      typeof ctx.spec.integrationId === 'string' && ctx.spec.integrationId.trim() !== ''
        ? ctx.spec.integrationId.trim()
        : undefined;
    const resolution = ctx.ports.google.resolveIntegration(ctx.scope, pinned);
    if (resolution.status !== 'ready') {
      return { notes: () => [googleNote(resolution)] };
    }
    const deps = {
      google: ctx.ports.google,
      resolveScope: () => ctx.scope,
      integrationId: resolution.integrationId,
    };
    return {
      tools: [
        ...createCalendarTools(deps),
        ...createGmailTools(deps),
        ...createYoutubeTools(deps),
        ...createYoutubeCommunityTools(deps),
        ...createSheetsTools(deps),
        ...createDocsTools(deps),
        ...createSearchConsoleTools(deps),
      ],
    };
  },
});

function googleNote(resolution: Exclude<GoogleIntegrationResolution, { status: 'ready' }>): {
  tag: string;
  text: string;
} {
  const tag = 'google-connect';
  if (resolution.status === 'ambiguous') {
    return {
      tag,
      text:
        'Several Google accounts are connected to this org. Set packs.google.spec.integrationId to pin one ' +
        '(ids are listed in Settings → Connectors); until then Google tools are unavailable.',
    };
  }
  if (resolution.status === 'not_found') {
    return {
      tag,
      text:
        'The Google connection pinned in packs.google.spec.integrationId no longer exists or is disconnected. ' +
        'Pick another id in Settings → Connectors; until then Google tools are unavailable.',
    };
  }
  return {
    tag,
    text: 'Google is not connected. Connect it in Settings → Connectors.',
  };
}

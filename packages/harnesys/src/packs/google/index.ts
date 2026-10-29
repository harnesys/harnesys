import { definePack } from '../../domain/pack.ts';
import type {
  GoogleIntegrationResolution,
  GoogleWorkspacePort,
} from '../../ports/google-workspace.ts';
import { createCalendarTools } from './create-calendar-tools.ts';
import { createGmailTools } from './create-gmail-tools.ts';

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
];

export const googleCapability = definePack<GoogleCapabilityPorts, GooglePackSpec>({
  name: 'google',
  version: '1.0.0',
  description:
    'Google Workspace: calendar_list_events / calendar_create_event / calendar_update_event / calendar_delete_event / gmail_search_messages / gmail_read_message / gmail_read_thread / gmail_download_attachment / gmail_send_message',
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
    return { tools: [...createCalendarTools(deps), ...createGmailTools(deps)] };
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

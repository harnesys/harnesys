import type { GoogleOAuthService, Integration } from '@harnesys/contracts';

export interface GoogleApiEntry {
  name: string;
  slug: string;
}

export interface GoogleServiceInfo {
  key: GoogleOAuthService;
  label: string;
  summary: string;
  abilities: string;
  apis: GoogleApiEntry[];
  sensitive: boolean;
}

export const GOOGLE_SERVICES: GoogleServiceInfo[] = [
  {
    key: 'drive',
    label: 'Drive',
    summary: 'Attach Drive folders as sources and read files.',
    abilities: 'Folder sources, file search, attachments',
    apis: [{ name: 'Drive API', slug: 'drive.googleapis.com' }],
    sensitive: false,
  },
  {
    key: 'gmail',
    label: 'Gmail',
    summary: 'Search and read mail, download attachments, send messages.',
    abilities: 'Search, read threads, attachments, send email',
    apis: [{ name: 'Gmail API', slug: 'gmail.googleapis.com' }],
    sensitive: true,
  },
  {
    key: 'calendar',
    label: 'Calendar',
    summary: 'See, create, and update events on the primary calendar.',
    abilities: 'List, create, update, delete events',
    apis: [{ name: 'Calendar API', slug: 'calendar-json.googleapis.com' }],
    sensitive: false,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    summary: 'Manage channels and videos: uploads, metadata, comments, analytics.',
    abilities: 'Channel stats, upload videos, thumbnails, playlists, comments, analytics',
    apis: [
      { name: 'YouTube Data API v3', slug: 'youtube.googleapis.com' },
      { name: 'YouTube Analytics API', slug: 'youtubeanalytics.googleapis.com' },
    ],
    sensitive: true,
  },
  {
    key: 'sheets',
    label: 'Sheets',
    summary: 'Read and edit spreadsheets — content plans, trackers, reports.',
    abilities: 'Read ranges, write ranges, append rows',
    apis: [{ name: 'Google Sheets API', slug: 'sheets.googleapis.com' }],
    sensitive: false,
  },
  {
    key: 'docs',
    label: 'Docs',
    summary: 'Read documents and append text — scripts, briefs, descriptions.',
    abilities: 'Read documents, append text blocks',
    apis: [{ name: 'Google Docs API', slug: 'docs.googleapis.com' }],
    sensitive: false,
  },
  {
    key: 'search_console',
    label: 'Search Console',
    summary: 'Search traffic for verified sites: queries, pages, clicks, positions.',
    abilities: 'List sites, search analytics reports',
    apis: [{ name: 'Search Console API', slug: 'searchconsole.googleapis.com' }],
    sensitive: false,
  },
];

const SERVICE_BY_KEY = new Map(GOOGLE_SERVICES.map((service) => [service.key, service]));

const SERVICE_SCOPE_MARKERS: Record<GoogleOAuthService, string[]> = {
  drive: ['/auth/drive'],
  gmail: ['/auth/gmail'],
  calendar: ['/auth/calendar'],
  youtube: ['/auth/youtube', '/auth/yt-analytics'],
  sheets: ['/auth/spreadsheets'],
  docs: ['/auth/documents'],
  search_console: ['/auth/webmasters'],
};

export function servicesFromScopes(scopes: readonly string[]): GoogleOAuthService[] {
  return GOOGLE_SERVICES.map((service) => service.key).filter((key) =>
    SERVICE_SCOPE_MARKERS[key].some((marker) => scopes.some((scope) => scope.includes(marker))),
  );
}

export function accountServices(account: Integration): GoogleOAuthService[] {
  return servicesFromScopes(account.grantedScopes ?? []);
}

export function hasDriveService(account: Integration): boolean {
  return accountServices(account).includes('drive');
}
export function googleServiceInfo(key: GoogleOAuthService): GoogleServiceInfo {
  const found = SERVICE_BY_KEY.get(key);
  if (!found) {
    throw new Error(`Unknown Google service: ${key}`);
  }
  return found;
}

export function googleServiceLabel(key: GoogleOAuthService): string {
  return googleServiceInfo(key).label;
}

export function googleServiceLabels(keys: GoogleOAuthService[]): string {
  if (keys.length === 0) {
    return 'nothing — pick at least one service';
  }
  return keys.map(googleServiceLabel).join(', ');
}

export const GOOGLE_API_LIBRARY_URL = 'https://console.cloud.google.com/apis/library';

export function googleApiLibraryUrl(entry: GoogleApiEntry): string {
  return `${GOOGLE_API_LIBRARY_URL}/${entry.slug}`;
}

export const GOOGLE_CONSENT_SCREEN_URL = 'https://console.cloud.google.com/apis/consent';
export const GOOGLE_OAUTH_CREDENTIALS_URL = 'https://console.cloud.google.com/apis/credentials';
export const GOOGLE_CLOUD_PROJECT_URL = 'https://console.cloud.google.com/projectcreate';

import type { GoogleOAuthService } from '@harnesys/contracts';
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_DOCS_SCOPE,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
  GOOGLE_SEARCH_CONSOLE_SCOPE,
  GOOGLE_SHEETS_SCOPE,
  GOOGLE_USERINFO_EMAIL_SCOPE,
  GOOGLE_USERINFO_PROFILE_SCOPE,
  GOOGLE_YOUTUBE_MANAGE_SCOPE,
  GOOGLE_YOUTUBE_READONLY_SCOPE,
  GOOGLE_YOUTUBE_UPLOAD_SCOPE,
  GOOGLE_YT_ANALYTICS_READONLY_SCOPE,
} from './google-oauth-device.ts';

const ALWAYS_SCOPES = [GOOGLE_USERINFO_PROFILE_SCOPE, GOOGLE_USERINFO_EMAIL_SCOPE] as const;

const SERVICE_SCOPES: Record<GoogleOAuthService, readonly string[]> = {
  drive: [GOOGLE_DRIVE_SCOPE, GOOGLE_DRIVE_FILE_SCOPE],
  gmail: [GOOGLE_GMAIL_READONLY_SCOPE, GOOGLE_GMAIL_SEND_SCOPE],
  calendar: [GOOGLE_CALENDAR_SCOPE],
  youtube: [
    GOOGLE_YOUTUBE_READONLY_SCOPE,
    GOOGLE_YOUTUBE_UPLOAD_SCOPE,
    GOOGLE_YOUTUBE_MANAGE_SCOPE,
    GOOGLE_YT_ANALYTICS_READONLY_SCOPE,
  ],
  sheets: [GOOGLE_SHEETS_SCOPE],
  docs: [GOOGLE_DOCS_SCOPE],
  search_console: [GOOGLE_SEARCH_CONSOLE_SCOPE],
};

export function googleScopesForServices(
  services?: readonly GoogleOAuthService[],
): string | undefined {
  if (services === undefined || services.length === 0) {
    return undefined;
  }
  const scopes = new Set<string>(ALWAYS_SCOPES);
  for (const service of services) {
    const mapped = SERVICE_SCOPES[service];
    if (mapped !== undefined) {
      for (const scope of mapped) {
        scopes.add(scope);
      }
    }
  }
  return [...scopes].join(' ');
}

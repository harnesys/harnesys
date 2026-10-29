export const ACCESS_TTL_SEC = 10 * 60;
export const REFRESH_IDLE_SEC = 7 * 24 * 60 * 60;
export const REFRESH_ABSOLUTE_SEC = 30 * 24 * 60 * 60;

export interface SessionTokens {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

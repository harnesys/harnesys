import { env } from '@/shared/config/env';
export function webhookDisplayUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }
  const base = env.localHostOrigin;
  return endpoint.startsWith('/') ? `${base}${endpoint}` : `${base}/${endpoint}`;
}

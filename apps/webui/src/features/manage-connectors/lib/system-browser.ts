import { env } from '@/shared/config/env';

export async function openSystemBrowser(url: string): Promise<void> {
  if (env.isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

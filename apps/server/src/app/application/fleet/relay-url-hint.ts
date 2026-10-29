import type { HostConfig } from '../../domain/machine/machine-config.port.ts';

export function listenPortOf(host: HostConfig): number {
  const parts = host.listen.split(':');
  const last = parts[parts.length - 1];
  const parsed = last ? Number.parseInt(last, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 47474;
}

export function relayUrlHint(host: HostConfig, port: number): string {
  if (host.publicOrigin?.trim()) {
    return host.publicOrigin.trim().replace(/\/+$/, '');
  }
  if (host.listen.includes(':')) {
    return `http://${host.listen}`;
  }
  return `http://127.0.0.1:${port}`;
}

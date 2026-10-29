import type { FleetNode } from '@harnesys/contracts';

export type HostStatusKind = 'online' | 'draining' | 'offline';
export type ConfigSyncKind = 'ready' | 'syncing' | 'stale' | 'incompatible' | 'unknown';

export function resolveHostStatus(node: FleetNode): HostStatusKind {
  if (node.status === 'draining') {
    return 'draining';
  }
  if (node.status === 'offline') {
    return 'offline';
  }
  return node.acceptsWork ? 'online' : 'offline';
}

export function hostStatusLabel(kind: HostStatusKind): string {
  if (kind === 'draining') {
    return 'Draining';
  }
  if (kind === 'online') {
    return 'Online';
  }
  return 'Offline';
}

export function hostStatusChip(kind: HostStatusKind): 'ok' | 'warn' | 'neutral' {
  if (kind === 'online') {
    return 'ok';
  }
  if (kind === 'draining') {
    return 'warn';
  }
  return 'neutral';
}

export function resolveConfigSync(node: FleetNode): ConfigSyncKind {
  return node.configSync ?? 'unknown';
}

export function configSyncLabel(sync: ConfigSyncKind): string {
  if (sync === 'ready') {
    return 'Ready';
  }
  if (sync === 'syncing') {
    return 'Syncing';
  }
  if (sync === 'stale') {
    return 'Stale';
  }
  if (sync === 'incompatible') {
    return 'Update required';
  }
  return 'Unknown';
}

export function configSyncChip(
  sync: ConfigSyncKind,
): 'ok' | 'info' | 'warn' | 'danger' | 'neutral' {
  if (sync === 'ready') {
    return 'ok';
  }
  if (sync === 'syncing') {
    return 'info';
  }
  if (sync === 'stale') {
    return 'warn';
  }
  if (sync === 'incompatible') {
    return 'danger';
  }
  return 'neutral';
}

export function hostRailClass(kind: HostStatusKind): string {
  if (kind === 'online') {
    return 'bg-status-ok';
  }
  if (kind === 'draining') {
    return 'bg-status-warn';
  }
  return 'bg-muted-foreground/35';
}

export function formatDisk(
  free: number | null | undefined,
  total: number | null | undefined,
): string | null {
  if (free == null || total == null) {
    return null;
  }
  return `${formatBytes(free)} free of ${formatBytes(total)}`;
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

export function summarizeHosts(nodes: FleetNode[]) {
  let online = 0;
  let draining = 0;
  let offline = 0;
  let syncing = 0;
  for (const node of nodes) {
    const status = resolveHostStatus(node);
    if (status === 'online') {
      online += 1;
    } else if (status === 'draining') {
      draining += 1;
    } else {
      offline += 1;
    }
    if (resolveConfigSync(node) === 'syncing') {
      syncing += 1;
    }
  }
  return { online, draining, offline, syncing, total: nodes.length };
}

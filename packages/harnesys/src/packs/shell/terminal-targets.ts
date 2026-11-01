import type {
  ProcessJobRecord,
  ProcessJobRegistry,
  ProcessJobTarget,
} from '../../domain/process-job.ts';
export interface ToolTargetInput {
  kind: 'host' | 'container' | 'ssh';
  host?: string;
  user?: string;
  port?: number;
  containerId?: string;
}
export interface TerminalSessionPorts {
  jobs: ProcessJobRegistry;
  resolveOrgId?: () => string | undefined;
  resolveThreadId?: () => string | undefined;
  sshHostApproved?: (host: string) => boolean;
  onSessionSpawned?: (record: ProcessJobRecord) => void;
}
export function describeTarget(target: ProcessJobTarget | undefined): string {
  if (target === undefined) {
    return 'host';
  }
  if (target.kind === 'container') {
    return `container:${target.containerId}`;
  }
  if (target.kind === 'ssh') {
    const userPart = target.user === undefined ? '' : `${target.user}@`;
    const portPart = target.port === undefined ? '' : `:${target.port}`;
    return `ssh:${userPart}${target.host}${portPart}`;
  }
  return 'host';
}
export function toRegistryTarget(input: ToolTargetInput | undefined): ProcessJobTarget | undefined {
  if (input === undefined || input.kind === 'host') {
    return undefined;
  }
  if (input.kind === 'container') {
    if (typeof input.containerId !== 'string' || input.containerId.length === 0) {
      throw new Error('container target requires containerId');
    }
    return { kind: 'container', containerId: input.containerId, orgId: '', workspaceKey: '' };
  }
  if (typeof input.host !== 'string' || input.host.length === 0) {
    throw new Error('ssh target requires host');
  }
  return {
    kind: 'ssh',
    host: input.host,
    ...(input.user === undefined ? {} : { user: input.user }),
    ...(input.port === undefined ? {} : { port: input.port }),
  };
}
export function tryToRegistryTarget(input: ToolTargetInput | undefined): {
  target: ProcessJobTarget | undefined;
  error?: string;
} {
  try {
    return { target: toRegistryTarget(input) };
  } catch (err) {
    return { target: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}
export function sshHostOf(input: ToolTargetInput | undefined): string | undefined {
  return input?.kind === 'ssh' && typeof input.host === 'string' ? input.host : undefined;
}
export function sshAskGate(
  host: string | undefined,
  ports: Pick<TerminalSessionPorts, 'sshHostApproved'>,
) {
  if (host === undefined) {
    return undefined;
  }
  if (ports.sshHostApproved?.(host)) {
    return undefined;
  }
  return { decision: 'ask' as const };
}

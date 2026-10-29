import type {
  MaterializationState,
  SourceHostNodeStatus,
  SourceHostStatus,
} from '@harnesys/contracts';
import type { StatusDotTone } from '@/shared/ui/status-dot';

export function actionErrorFor(
  mutation: {
    isError: boolean;
    variables?: string;
    error: unknown;
  },
  hostId: string,
): string | null {
  if (!mutation.isError || mutation.variables !== hostId) {
    return null;
  }
  if (mutation.error instanceof Error) {
    return mutation.error.message;
  }
  return 'Action failed';
}

export function nodeRoleLabel(role: 'relay' | 'worker' | undefined): string {
  if (role === 'relay') {
    return 'Server';
  }
  if (role === 'worker') {
    return 'Worker';
  }
  return 'Node';
}

export function detailCopy(
  row: SourceHostStatus,
  distributionKind: 'host-bound' | 'cloud-drive',
): string {
  if (row.errorCode) {
    return row.errorCode;
  }
  if (row.lastConflictPaths.length > 0) {
    return `Conflicts kept: ${row.lastConflictPaths.join(', ')}`;
  }
  if (row.refreshRequired) {
    return 'Provider changed elsewhere; refresh required';
  }
  if (row.materialization === 'absent' && distributionKind !== 'host-bound') {
    return 'Node not prepared yet';
  }
  if (row.stale) {
    return 'Last confirmed state; node is not online';
  }
  if (row.materialization === 'ready') {
    return distributionKind === 'cloud-drive'
      ? 'Mirror confirmed ready'
      : 'Directory confirmed ready';
  }
  if (row.materialization === 'materializing') {
    return 'Materialization in progress';
  }
  return '—';
}

export function nodeTone(status: SourceHostNodeStatus): StatusDotTone {
  if (status === 'online') {
    return 'live';
  }
  if (status === 'draining') {
    return 'wait';
  }
  return 'off';
}

export function materializationTone(state: MaterializationState): StatusDotTone {
  if (state === 'ready') {
    return 'live';
  }
  if (state === 'materializing') {
    return 'wait';
  }
  if (state === 'failed') {
    return 'danger';
  }
  return 'idle';
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

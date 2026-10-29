import type { IntegrationStatus } from '@harnesys/contracts';
import type { StatusDotTone } from '@/shared/ui/status-dot';

export function integrationStatusTone(status: IntegrationStatus): StatusDotTone {
  if (status === 'connected') {
    return 'ok';
  }
  if (status === 'expired') {
    return 'warn';
  }
  return 'danger';
}

export function integrationStatusLabel(status: IntegrationStatus): string {
  if (status === 'connected') {
    return 'Connected';
  }
  if (status === 'expired') {
    return 'Token expired';
  }
  return 'Disconnected';
}

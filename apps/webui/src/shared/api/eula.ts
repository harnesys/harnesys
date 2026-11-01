import type { EulaStatus } from '@harnesys/contracts';
import { apiJson } from './client';

export type { EulaStatus };

export function getEulaStatus(): Promise<EulaStatus> {
  return apiJson<EulaStatus>('/api/eula');
}

export function acceptEula(agreementId: string): Promise<EulaStatus> {
  return apiJson<EulaStatus>('/api/eula/accept', {
    method: 'POST',
    body: JSON.stringify({ agreementId }),
  });
}

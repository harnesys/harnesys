import { Injectable } from '@harnesys/brix';
import { EULA_CURRENT_AGREEMENT, type EulaStatus } from '@harnesys/contracts';
import { EulaVersionMismatchException } from '../../domain/eula/eula.error.ts';
import { EulaPort } from '../../domain/eula/eula.port.ts';

export interface AcceptEulaRequest {
  agreementId: string;
}

@Injectable()
export class AcceptEulaUseCase {
  constructor(private readonly eula: EulaPort) {}

  execute(request: AcceptEulaRequest): EulaStatus {
    if (request.agreementId !== EULA_CURRENT_AGREEMENT.id) {
      throw new EulaVersionMismatchException();
    }
    const consent = this.eula.recordConsent({
      agreementId: request.agreementId,
      acceptedAt: new Date().toISOString(),
    });
    return { agreement: EULA_CURRENT_AGREEMENT, consent };
  }
}

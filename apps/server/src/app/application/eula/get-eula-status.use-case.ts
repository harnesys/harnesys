import { Injectable } from '@harnesys/brix';
import { EULA_CURRENT_AGREEMENT, type EulaStatus } from '@harnesys/contracts';
import { EulaPort } from '../../domain/eula/eula.port.ts';

@Injectable()
export class GetEulaStatusUseCase {
  constructor(private readonly eula: EulaPort) {}

  execute(): EulaStatus {
    return {
      agreement: EULA_CURRENT_AGREEMENT,
      consent: this.eula.getConsent(EULA_CURRENT_AGREEMENT.id),
    };
  }
}

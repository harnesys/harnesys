import type { EulaConsent } from '@harnesys/contracts';

export abstract class EulaPort {
  abstract getConsent(agreementId: string): EulaConsent | null;
  abstract recordConsent(consent: EulaConsent): EulaConsent;
}

import { describe, expect, test } from 'bun:test';
import { EULA_CURRENT_AGREEMENT, type EulaConsent } from '@harnesys/contracts';
import { EulaVersionMismatchException } from '../../domain/eula/eula.error.ts';
import { EulaPort } from '../../domain/eula/eula.port.ts';
import { AcceptEulaUseCase } from './accept-eula.use-case.ts';
import { GetEulaStatusUseCase } from './get-eula-status.use-case.ts';

class MemoryEulaPort extends EulaPort {
  private readonly acceptedAtByAgreement = new Map<string, string>();

  getConsent(agreementId: string): EulaConsent | null {
    const acceptedAt = this.acceptedAtByAgreement.get(agreementId);
    return acceptedAt === undefined ? null : { agreementId, acceptedAt };
  }

  recordConsent(consent: EulaConsent): EulaConsent {
    this.acceptedAtByAgreement.set(consent.agreementId, consent.acceptedAt);
    return consent;
  }

  get size(): number {
    return this.acceptedAtByAgreement.size;
  }
}

describe('AcceptEulaUseCase', () => {
  test('records consent for the current agreement id', () => {
    const port = new MemoryEulaPort();
    const status = new AcceptEulaUseCase(port).execute({
      agreementId: EULA_CURRENT_AGREEMENT.id,
    });
    expect(status.consent).not.toBeNull();
    expect(status.consent?.agreementId).toBe(EULA_CURRENT_AGREEMENT.id);
    expect(Number.isNaN(Date.parse(status.consent?.acceptedAt ?? ''))).toBe(false);
    expect(port.size).toBe(1);
  });

  test('rejects a foreign agreement id without recording anything', () => {
    const port = new MemoryEulaPort();
    expect(() =>
      new AcceptEulaUseCase(port).execute({ agreementId: 'harnesys-eula-0.0.1' }),
    ).toThrow(EulaVersionMismatchException);
    expect(port.size).toBe(0);
  });

  test('re-accepting overwrites the single consent row per agreement', () => {
    const port = new MemoryEulaPort();
    const useCase = new AcceptEulaUseCase(port);
    const first = useCase.execute({ agreementId: EULA_CURRENT_AGREEMENT.id }).consent;
    const second = useCase.execute({ agreementId: EULA_CURRENT_AGREEMENT.id }).consent;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.agreementId).toBe(first?.agreementId);
    expect(port.size).toBe(1);
  });
});

describe('GetEulaStatusUseCase', () => {
  test('returns the current agreement with null consent before acceptance', () => {
    const status = new GetEulaStatusUseCase(new MemoryEulaPort()).execute();
    expect(status.agreement.id).toBe(EULA_CURRENT_AGREEMENT.id);
    expect(status.consent).toBeNull();
  });

  test('returns the stored consent after acceptance', () => {
    const port = new MemoryEulaPort();
    new AcceptEulaUseCase(port).execute({ agreementId: EULA_CURRENT_AGREEMENT.id });
    const status = new GetEulaStatusUseCase(port).execute();
    expect(status.consent?.agreementId).toBe(EULA_CURRENT_AGREEMENT.id);
  });
});

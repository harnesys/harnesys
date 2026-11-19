import type { ModelQuotaPort } from 'harnesys';

export abstract class ModelQuotaFactoryPort {
  abstract forOrg(orgId: string): ModelQuotaPort;
}

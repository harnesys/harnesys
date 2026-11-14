import type { IntegrationRegistryPort } from '../../../domain/integration/integration-registry.port.ts';
import type { IntegrationTokenPort } from '../../../domain/integration/integration-token.port.ts';

export interface OrgGoogleDeps {
  registry: IntegrationRegistryPort;
  tokens: IntegrationTokenPort;
}

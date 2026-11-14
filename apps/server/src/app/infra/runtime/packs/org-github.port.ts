import type { IntegrationEventsPort } from '../../../domain/integration/integration-events.port.ts';
import type { IntegrationRegistryPort } from '../../../domain/integration/integration-registry.port.ts';
import type { IntegrationTokenPort } from '../../../domain/integration/integration-token.port.ts';

export interface OrgGithubDeps {
  registry: IntegrationRegistryPort;
  tokens: IntegrationTokenPort;
  events: IntegrationEventsPort;
}

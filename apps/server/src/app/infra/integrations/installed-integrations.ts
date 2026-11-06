import { telegramIntegration } from '@harnesys/integration-telegram';
import type { IntegrationDefinition } from 'harnesys/integration';

export const INSTALLED_INTEGRATIONS: IntegrationDefinition[] = [telegramIntegration];

export function installedIntegration(id: string): IntegrationDefinition | undefined {
  return INSTALLED_INTEGRATIONS.find((definition) => definition.id === id);
}

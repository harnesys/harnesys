import { telegramUi } from './telegram';
import type { WebuiIntegrationDescriptor } from './types';

export type {
  AutomationConfigInput,
  AutomationKindDescriptor,
  WebuiIntegrationDescriptor,
} from './types';

export const INTEGRATION_UI_REGISTRY: WebuiIntegrationDescriptor[] = [telegramUi];

export function findIntegrationUi(integrationId: string): WebuiIntegrationDescriptor | undefined {
  return INTEGRATION_UI_REGISTRY.find((item) => item.id === integrationId);
}

export function automationKindLabel(integrationId: string, kind: string): string | undefined {
  return findIntegrationUi(integrationId)?.automationKinds[kind]?.label;
}

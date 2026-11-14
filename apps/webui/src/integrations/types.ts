import type { ComponentType } from 'react';
import type { Agent } from '@/entities/agent';
import type { AutomationSource, ClientAutomation } from '@/entities/automation';

export interface AutomationConfigInput {
  integrationId: string;
  kind: string;
  source?: AutomationSource;
  scopeId: string;
  agents: Agent[];
  automation: ClientAutomation | null;
}

export interface AutomationKindDescriptor {
  label: string;
  description: string;
  openConfig(input: AutomationConfigInput): void | Promise<void>;
}

export interface WebuiIntegrationDescriptor {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  connectorProvider?: string;
  settings?: ComponentType<{ orgId: string }>;
  automationKinds: Record<string, AutomationKindDescriptor>;
}

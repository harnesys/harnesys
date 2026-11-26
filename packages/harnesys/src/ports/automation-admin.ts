import type { TriggerScriptRunList, TriggerScriptTestResponse } from '@harnesys/contracts';

export interface AutomationActionDescriptor {
  id: string;
  title: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface AutomationTriggerKind {
  addonId: string;
  addonTitle: string;
  kind: string;
  title: string;
  description?: string;
  configFields?: unknown[];
  connection?: string;
  standard?: unknown;
  limits?: unknown;
  actions?: AutomationActionDescriptor[];
}

export interface AutomationInstance {
  instanceId: string;
  addonId: string;
  kind: string;
  label: string;
  enabled: boolean;
  instructions: string;
  config: Record<string, unknown>;
  target: Record<string, unknown> | null;
  actions?: AutomationActionDescriptor[];
  createdAt: string;
  updatedAt: string;
}

export interface AutomationCreateInput {
  addonId: string;
  kind: string;
  label: string;
  config?: Record<string, unknown>;
  instructions?: string;
  target: Record<string, unknown>;
  enabled?: boolean;
}

export interface AutomationUpdateInput {
  instanceId: string;
  label?: string;
  config?: Record<string, unknown>;
  instructions?: string;
  target?: Record<string, unknown>;
  enabled?: boolean;
}

export interface AutomationScriptTestInput {
  script: Record<string, unknown>;
  gate?: Record<string, unknown>;
}

export abstract class AutomationAdminPort {
  abstract listKinds(orgId: string): AutomationTriggerKind[];

  abstract list(orgId: string): AutomationInstance[];

  abstract get(orgId: string, instanceId: string): AutomationInstance | null;

  abstract create(orgId: string, input: AutomationCreateInput): Promise<AutomationInstance>;

  abstract update(orgId: string, input: AutomationUpdateInput): Promise<AutomationInstance>;

  abstract setEnabled(orgId: string, instanceId: string, enabled: boolean): Promise<void>;

  abstract remove(orgId: string, instanceId: string): Promise<void>;

  abstract action(
    orgId: string,
    instanceId: string,
    action: string,
    input?: Record<string, unknown>,
  ): Promise<unknown>;

  abstract scriptRuns(orgId: string, instanceId: string, limit: number): TriggerScriptRunList;

  abstract testScript(
    orgId: string,
    instanceId: string,
    input: AutomationScriptTestInput,
  ): Promise<TriggerScriptTestResponse>;
}

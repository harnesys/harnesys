export interface AutomationChangedEvent {
  kind: string;
  action: 'changed' | 'removed';
}

export type AutomationChangedListener = (frame: AutomationChangedEvent & { orgId: string }) => void;

export abstract class AutomationEventsPort {
  abstract publish(orgId: string, event: AutomationChangedEvent): void;
  abstract subscribe(listener: AutomationChangedListener): () => void;
}

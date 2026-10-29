import { Injectable } from '@harnesys/brix';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';

export interface SkillsEventFrame {
  orgId: string;
  kind: 'changed';
  name?: string;
}

@Injectable()
export class SkillsEventsAdapter extends SkillsEventsPort {
  private readonly listeners = new Set<(frame: SkillsEventFrame) => void>();

  publish(orgId: string, event: { kind: 'changed'; name?: string }): void {
    for (const listener of this.listeners) {
      try {
        listener({
          orgId,
          kind: event.kind,
          ...(event.name !== undefined ? { name: event.name } : {}),
        });
      } catch {
        // listener errors must not break publish fan-out
      }
    }
  }

  subscribe(
    listener: (frame: { orgId: string; kind: 'changed'; name?: string }) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

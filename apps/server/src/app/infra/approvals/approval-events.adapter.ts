import { Injectable } from '@harnesys/brix';
import {
  type ApprovalEvent,
  type ApprovalEventListener,
  ApprovalEventsPort,
} from '../../domain/approval/approval-events.port.ts';

@Injectable()
export class ApprovalEventsAdapter extends ApprovalEventsPort {
  private readonly listeners = new Set<ApprovalEventListener>();

  subscribe(listener: ApprovalEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(orgId: string, event: ApprovalEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(orgId, event);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}

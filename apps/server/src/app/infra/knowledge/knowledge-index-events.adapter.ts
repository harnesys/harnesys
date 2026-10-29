import { Injectable } from '@harnesys/brix';
import type { KnowledgeIndexState } from '@harnesys/studio-shared';
import {
  KnowledgeIndexEventsPort,
  type KnowledgeIndexStateAllListener,
  type KnowledgeIndexStateListener,
} from '../../domain/knowledge/knowledge-index-events.port.ts';

@Injectable()
export class KnowledgeIndexEventsAdapter extends KnowledgeIndexEventsPort {
  private readonly listeners = new Map<string, Set<KnowledgeIndexStateListener>>();
  private readonly allListeners = new Set<KnowledgeIndexStateAllListener>();

  subscribe(sourceId: string, listener: KnowledgeIndexStateListener): () => void {
    let set = this.listeners.get(sourceId);
    if (!set) {
      set = new Set();
      this.listeners.set(sourceId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(sourceId);
      }
    };
  }

  subscribeAll(listener: KnowledgeIndexStateAllListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  emit(sourceId: string, state: KnowledgeIndexState): void {
    for (const listener of this.listeners.get(sourceId) ?? []) {
      try {
        listener(state);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
    for (const listener of this.allListeners) {
      try {
        listener(sourceId, state);
      } catch {
        // listener errors must not break emit fan-out
      }
    }
  }
}

import { create } from 'zustand';
import type { Webhook, WebhookStatus } from './webhook';
export interface WebhookDraft {
  name: string;
  targetAgentId: string;
  detail?: string;
  threadId?: string;
}
export interface WebhookPatch {
  name?: string;
  status?: WebhookStatus;
  targetAgentId?: string;
  detail?: string;
  endpoint?: string;
}
interface WebhookStore {
  items: Webhook[];
  byId: (id: string) => Webhook | undefined;
  inProject: (projectId: string) => Webhook[];
  upsert: (webhook: Webhook) => void;
  replaceProject: (projectId: string, webhooks: Webhook[]) => void;
  update: (webhookId: string, patch: WebhookPatch) => void;
  remove: (webhookId: string) => void;
}
export const useWebhookStore = create<WebhookStore>((set, get) => ({
  items: [],
  byId: (id) => get().items.find((item) => item.id === id),
  inProject: (projectId) => get().items.filter((item) => item.projectId === projectId),
  upsert: (webhook) => {
    set((state) => ({
      items: state.items.some((item) => item.id === webhook.id)
        ? state.items.map((item) => (item.id === webhook.id ? webhook : item))
        : [...state.items, webhook],
    }));
  },
  replaceProject: (projectId, webhooks) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.projectId !== projectId), ...webhooks],
    }));
  },
  update: (webhookId, patch) => {
    const current = get().items.find((item) => item.id === webhookId);
    if (!current) {
      return;
    }
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) {
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === webhookId
          ? {
              ...item,
              name: name ?? item.name,
              status: patch.status ?? item.status,
              targetAgentId: patch.targetAgentId ?? item.targetAgentId,
              detail: patch.detail?.trim() || item.detail,
              endpoint: patch.endpoint?.trim() || item.endpoint,
            }
          : item,
      ),
    }));
  },
  remove: (webhookId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== webhookId),
    }));
  },
}));

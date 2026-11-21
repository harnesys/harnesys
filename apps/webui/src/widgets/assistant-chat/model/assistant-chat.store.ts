import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ASSISTANT_CHAT_STORAGE_KEY } from '@/shared/config/constants';

export interface AssistantChatPosition {
  right: number;
  bottom: number;
}

export interface AssistantChatSize {
  width: number;
  height: number;
}

const DEFAULT_POSITION: AssistantChatPosition = { right: 16, bottom: 16 };
const DEFAULT_SIZE: AssistantChatSize = { width: 400, height: 620 };

interface AssistantChatState {
  visible: boolean;
  open: boolean;
  pinned: boolean;
  agentId: string | null;
  threadByAgent: Record<string, string>;
  position: AssistantChatPosition;
  size: AssistantChatSize;
  show: () => void;
  hide: () => void;
  toggleVisible: () => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  togglePinned: () => void;
  setAgent: (agentId: string) => void;
  setThread: (agentId: string, threadId: string) => void;
  setPosition: (position: AssistantChatPosition) => void;
  setSize: (size: AssistantChatSize) => void;
}

export const useAssistantChatStore = create<AssistantChatState>()(
  persist(
    (set) => ({
      visible: true,
      open: false,
      pinned: false,
      agentId: null,
      threadByAgent: {},
      position: DEFAULT_POSITION,
      size: DEFAULT_SIZE,
      show: () => set({ visible: true, open: true }),
      hide: () => set({ visible: false }),
      toggleVisible: () =>
        set((state) => (state.visible ? { visible: false } : { visible: true, open: true })),
      toggleOpen: () => set((state) => ({ open: !state.open })),
      setOpen: (open) => set({ open }),
      togglePinned: () => set((state) => ({ pinned: !state.pinned })),
      setAgent: (agentId) => set({ agentId }),
      setThread: (agentId, threadId) =>
        set((state) => ({
          threadByAgent: { ...state.threadByAgent, [agentId]: threadId },
        })),
      setPosition: (position) => set({ position }),
      setSize: (size) => set({ size }),
    }),
    {
      name: ASSISTANT_CHAT_STORAGE_KEY,
      partialize: (state) => ({
        visible: state.visible,
        open: state.open,
        pinned: state.pinned,
        agentId: state.agentId,
        threadByAgent: state.threadByAgent,
        position: state.position,
        size: state.size,
      }),
    },
  ),
);

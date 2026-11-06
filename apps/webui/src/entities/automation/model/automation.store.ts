import { create } from 'zustand';
import type { ClientAutomation } from './automation';

interface AutomationStore {
  items: ClientAutomation[];
  replaceProject: (projectId: string, automations: ClientAutomation[]) => void;
}
export const useAutomationStore = create<AutomationStore>((set) => ({
  items: [],
  replaceProject: (projectId, automations) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.projectId !== projectId), ...automations],
    }));
  },
}));

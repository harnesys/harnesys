import type { MachineOrgEntry } from '@harnesys/studio-shared';
import { create } from 'zustand';

interface ActiveOrgState {
  orgId: string | null;
  orgs: MachineOrgEntry[];
  ready: boolean;
  setOrgId: (id: string | null) => void;
  setOrgs: (orgs: MachineOrgEntry[]) => void;
  setReady: (ready: boolean) => void;
}

export const useActiveOrgStore = create<ActiveOrgState>((set) => ({
  orgId: null,
  orgs: [],
  ready: false,
  setOrgId: (orgId) => set({ orgId }),
  setOrgs: (orgs) => set({ orgs }),
  setReady: (ready) => set({ ready }),
}));

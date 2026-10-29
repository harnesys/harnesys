import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { MachineOrgEntry } from '@/shared/api/orgs';

interface OrgContextValue {
  ready: boolean;
  orgs: MachineOrgEntry[];
  activeOrgId: string | null;
  setReady: (ready: boolean) => void;
  setOrgs: (orgs: MachineOrgEntry[]) => void;
  setActiveOrgId: (orgId: string | null) => void;
  upsertOrg: (entry: MachineOrgEntry) => void;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [orgs, setOrgs] = useState<MachineOrgEntry[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const upsertOrg = useCallback((entry: MachineOrgEntry) => {
    setOrgs((current) => {
      const index = current.findIndex((row) => row.orgId === entry.orgId);
      if (index === -1) {
        return [...current, entry];
      }
      const next = [...current];
      next[index] = entry;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      orgs,
      activeOrgId,
      setReady,
      setOrgs,
      setActiveOrgId,
      upsertOrg,
    }),
    [ready, orgs, activeOrgId, upsertOrg],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgStore() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrgStore must be used within OrgProvider');
  }
  return context;
}

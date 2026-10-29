import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext } from 'react';
import { orgSettingsQuery } from '@/shared/api/org-skills';
import { browserTimeZone, isValidTimeZone } from '@/shared/lib/time-zone';

const OrgTimeZoneContext = createContext<string | null>(null);

export function OrgTimeZoneProvider({
  orgId,
  children,
}: {
  orgId: string | null;
  children: ReactNode;
}) {
  const settingsQuery = useQuery(orgSettingsQuery(orgId ?? ''));
  const timeZone = resolveTimeZone(settingsQuery.data?.timezone);
  return <OrgTimeZoneContext.Provider value={timeZone}>{children}</OrgTimeZoneContext.Provider>;
}

export function useOrgTimeZone(): string {
  return useContext(OrgTimeZoneContext) ?? browserTimeZone();
}

function resolveTimeZone(value: string | undefined): string {
  if (!value || !isValidTimeZone(value)) {
    return browserTimeZone();
  }
  return value;
}

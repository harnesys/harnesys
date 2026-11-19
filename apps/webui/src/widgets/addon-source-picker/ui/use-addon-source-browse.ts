import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import {
  type AddonSourceBrowseResponse,
  type AddonSourceKind,
  browseOrgAddonSourceKind,
} from '@/shared/api/addon-sources';

export interface AddonSourcePickerProps {
  orgId: string;
  addonId: string;
  kind: AddonSourceKind;
  onChanged: () => Promise<void>;
}

export function useAddonSourceBrowse(
  orgId: string,
  addonId: string,
  kind: AddonSourceKind,
  accountId: string | undefined,
  folderId: string | undefined,
): UseQueryResult<AddonSourceBrowseResponse, Error> {
  return useQuery({
    queryKey: [
      'addon-source-kind-browse',
      orgId,
      addonId,
      kind.id,
      accountId ?? '',
      folderId ?? 'root',
    ] as const,
    queryFn: () =>
      browseOrgAddonSourceKind(orgId, addonId, kind.id, {
        ...(folderId ? { folderId } : {}),
        ...(accountId ? { accountId } : {}),
      }),
  });
}

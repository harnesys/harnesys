import { useQuery } from '@tanstack/react-query';
import { readContentFile } from '@/shared/api/content';

export function useFindInFilesPreview(orgId: string, sourceId: string | null, path: string | null) {
  return useQuery({
    queryKey: ['find-in-files-preview', orgId, sourceId, path],
    queryFn: () => readContentFile(orgId, sourceId ?? '', path ?? ''),
    enabled: orgId.length > 0 && sourceId !== null && path !== null,
    staleTime: 10_000,
  });
}

import { useIdeStore } from '@/features/ide';
import { openProjectFile } from '@/features/open-file';
import { useStudioNavigation } from '@/shared/config/navigation';
import { setPendingReveal } from '@/widgets/file-pane';
import type { FindHit } from './find-in-files-search';

export function useOpenFindHit() {
  const { openFile } = useStudioNavigation();
  return (hit: FindHit) => {
    setPendingReveal({ path: hit.path, lineNumber: hit.match.line, column: hit.match.column });
    openProjectFile(hit.sourceId, hit.path);
    useIdeStore.getState().openFile(hit.sourceId, hit.path);
    openFile(hit.sourceId, hit.path);
  };
}

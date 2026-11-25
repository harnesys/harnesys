import { useOpenFile } from '@/features/ide';
import { setPendingReveal } from '@/widgets/file-pane';
import type { FindHit } from './find-in-files-search';

export function useOpenFindHit() {
  const openFile = useOpenFile();
  return (hit: FindHit) => {
    setPendingReveal({ path: hit.path, lineNumber: hit.match.line, column: hit.match.column });
    openFile({ source: 'project', projectId: hit.sourceId, path: hit.path });
  };
}

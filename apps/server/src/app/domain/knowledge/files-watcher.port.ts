import type { ProjectFileEntry, ProjectFileEvent } from '@harnesys/studio-shared';

export abstract class FilesWatcherPort {
  abstract watch(
    sourceId: string,
    projectPath: string,
    onEvent: (event: ProjectFileEvent) => void,
  ): () => void;
  abstract listTree(projectPath: string): Promise<ProjectFileEntry[]>;
}

export type FilesWatcherInput = FilesWatcherPort;

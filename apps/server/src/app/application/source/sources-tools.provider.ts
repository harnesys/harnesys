import { Injectable } from '@harnesys/brix';
import type { OrgSourcesDeps } from '../../infra/runtime/packs/org-sources.pack.port.ts';
import { setSourcesToolsDeps } from '../../infra/runtime/packs/sources-tools.holder.ts';
import { AttachLocalFolderUseCase } from './attach-local-folder.use-case.ts';
import { ListSourcesUseCase } from './list-sources.use-case.ts';
import { RenameSourceUseCase } from './rename-source.use-case.ts';
import { SetSourceVisibilityUseCase } from './set-source-visibility.use-case.ts';

@Injectable()
export class SourcesToolsProvider {
  constructor(
    private readonly listSources: ListSourcesUseCase,
    private readonly attachLocalFolder: AttachLocalFolderUseCase,
    private readonly renameSource: RenameSourceUseCase,
    private readonly setSourceVisibility: SetSourceVisibilityUseCase,
  ) {
    const deps: OrgSourcesDeps = {
      list: this.listSources,
      attachFolder: this.attachLocalFolder,
      rename: this.renameSource,
      setVisibility: this.setSourceVisibility,
    };
    setSourcesToolsDeps(deps);
  }
}

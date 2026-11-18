import type { Source } from '@harnesys/contracts';
import type {
  CapabilityScope,
  SourcesAttachFolderInput,
  SourcesPort,
  SourcesSummary,
  SourcesUpdateInput,
} from 'harnesys';
import { AttachLocalFolderUseCase } from '../../../application/source/attach-local-folder.use-case.ts';
import { ListSourcesUseCase } from '../../../application/source/list-sources.use-case.ts';
import { RenameSourceUseCase } from '../../../application/source/rename-source.use-case.ts';
import { SetSourceVisibilityUseCase } from '../../../application/source/set-source-visibility.use-case.ts';

export interface OrgSourcesDeps {
  list: Pick<ListSourcesUseCase, 'execute'>;
  attachFolder: Pick<AttachLocalFolderUseCase, 'execute'>;
  rename: Pick<RenameSourceUseCase, 'execute'>;
  setVisibility: Pick<SetSourceVisibilityUseCase, 'execute'>;
}

export class OrgSourcesPort implements SourcesPort {
  constructor(private readonly deps: OrgSourcesDeps) {}

  list(scope: CapabilityScope): Promise<SourcesSummary[]> {
    const res = this.deps.list.execute({ orgId: scope.orgId, surfaceHostId: null });
    return Promise.resolve(res.sources.map(toSourcesSummary));
  }

  async attachFolder(
    scope: CapabilityScope,
    input: SourcesAttachFolderInput,
  ): Promise<SourcesSummary> {
    const source = await this.deps.attachFolder.execute({
      orgId: scope.orgId,
      absolutePath: input.absolutePath,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.uiVisibility !== undefined ? { uiVisibility: input.uiVisibility } : {}),
    });
    return toSourcesSummary(source);
  }

  async update(scope: CapabilityScope, input: SourcesUpdateInput): Promise<SourcesSummary> {
    let source: Source | undefined;
    if (input.name !== undefined) {
      source = this.deps.rename.execute({
        orgId: scope.orgId,
        sourceId: input.sourceId,
        name: input.name,
      });
    }
    if (input.uiVisibility !== undefined) {
      source = this.deps.setVisibility.execute({
        orgId: scope.orgId,
        sourceId: input.sourceId,
        uiVisibility: input.uiVisibility,
      });
    }
    if (source === undefined) {
      throw new Error('sources_update requires name or uiVisibility');
    }
    return toSourcesSummary(source);
  }
}

function toSourcesSummary(source: Source): SourcesSummary {
  return {
    id: source.id,
    name: source.name,
    managed: source.managed,
    uiVisibility: source.uiVisibility,
    vcs: source.vcs ? 'git' : null,
    hostId: source.distribution.kind === 'host-bound' ? source.distribution.hostId : null,
  };
}

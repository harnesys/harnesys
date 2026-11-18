import { definePack } from '../../domain/pack.ts';
import type { SourcesPort } from '../../ports/sources.ts';
import { createSourceTools } from './create-source-tools.ts';

export interface SourcesCapabilityPorts {
  sources: SourcesPort;
}

export const sourcesCapability = definePack<SourcesCapabilityPorts, Record<string, unknown>>({
  name: 'sources',
  version: '1.0.0',
  description:
    'Connect and configure project sources: sources_list / sources_attach / sources_update',
  icon: 'sources',
  meta: {
    tools: [
      {
        name: 'sources_list',
        description:
          'List sources (connected folders and repositories) of this project: id, name, whether it is the managed workspace, vcs, visibility, host. Pass an id to sources_update to rename or change visibility.',
      },
      {
        name: 'sources_attach',
        description:
          'Connect an existing folder on the host as a source of this project so it appears in the Sources list. absolutePath must be an existing directory on the machine (create it first with the shell tools). Optional name defaults to the folder name. Requires approval before the folder is connected.',
      },
      {
        name: 'sources_update',
        description:
          'Configure a connected source: rename it and/or change its visibility. sourceId comes from sources_list. Omit a field to leave it unchanged.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: createSourceTools({ sources: ctx.ports.sources, resolveScope: () => ctx.scope }),
  }),
});

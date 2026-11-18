import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  SourcesAttachFolderInput,
  SourcesPort,
  SourcesUiVisibility,
  SourcesUpdateInput,
} from '../../ports/sources.ts';
import { type ToolCallGate, type ToolDefinition, tool } from '../../ports/tools.ts';

export interface CreateSourceToolsParams {
  sources: SourcesPort;
  resolveScope: () => CapabilityScope;
}

const UI_VISIBILITIES: SourcesUiVisibility[] = ['org', 'host'];

async function runGuard<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      error: string;
    }
> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function attachGate(input: unknown): ToolCallGate {
  const absolutePath = (input as { absolutePath?: unknown }).absolutePath;
  return typeof absolutePath === 'string'
    ? { decision: 'ask', subject: { file: { path: absolutePath, action: 'edit' } } }
    : { decision: 'ask' };
}

export function createSourceTools(deps: CreateSourceToolsParams): ToolDefinition[] {
  return [
    tool('sources_list', {
      group: 'sources',
      description:
        'List sources (connected folders and repositories) of this project: id, name, whether it is the managed workspace, vcs, visibility, host. Pass an id to sources_update to rename or change visibility.',
      operations: ['read'],
      sideEffect: 'read',
      input: { type: 'object' },
      execute: async () =>
        runGuard(async () => {
          const sources = await deps.sources.list(deps.resolveScope());
          return { sources };
        }),
    }),
    tool('sources_attach', {
      group: 'sources',
      description:
        'Connect an existing folder on the host as a source of this project so it appears in the Sources list. absolutePath must be an existing directory on the machine (create it first with the shell tools). Optional name defaults to the folder name. Requires approval before the folder is connected.',
      operations: ['write'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          absolutePath: {
            type: 'string',
            description: 'Absolute path of an existing directory on the host.',
          },
          name: { type: 'string', description: 'Display name. Defaults to the folder name.' },
          uiVisibility: {
            type: 'string',
            enum: UI_VISIBILITIES,
            description: 'org = visible to the whole project (default), host = only on its host.',
          },
        },
        required: ['absolutePath'],
      },
      gate: attachGate,
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as SourcesAttachFolderInput;
          const source = await deps.sources.attachFolder(deps.resolveScope(), input);
          return { source };
        }),
    }),
    tool('sources_update', {
      group: 'sources',
      description:
        'Configure a connected source: rename it and/or change its visibility. sourceId comes from sources_list. Omit a field to leave it unchanged.',
      operations: ['write'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Source to configure, from sources_list.' },
          name: { type: 'string', description: 'New display name.' },
          uiVisibility: {
            type: 'string',
            enum: UI_VISIBILITIES,
            description: 'org = visible to the whole project, host = only on its host.',
          },
        },
        required: ['sourceId'],
      },
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as SourcesUpdateInput;
          const source = await deps.sources.update(deps.resolveScope(), input);
          return { source };
        }),
    }),
  ];
}

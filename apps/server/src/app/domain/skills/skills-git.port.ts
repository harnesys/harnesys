export interface ClonePluginRequest {
  source: string;
  dest: string;
  ref?: string;
}

export interface PluginRevision {
  revision: string;
}

export abstract class SkillsGitPort {
  abstract resolveGitSource(source: string): string;
  abstract clonePlugin(request: ClonePluginRequest): Promise<PluginRevision>;
}

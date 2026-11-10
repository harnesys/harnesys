import { Injectable } from '@harnesys/brix';
import type { ClonePluginRequest, PluginRevision } from '../../domain/skills/skills-git.port.ts';
import { SkillsGitPort } from '../../domain/skills/skills-git.port.ts';
import { clonePlugin, resolveGitSource } from '../plugins/plugin-git.ts';

@Injectable()
export class SkillsGitAdapter extends SkillsGitPort {
  override resolveGitSource(source: string): string {
    return resolveGitSource(source);
  }

  override clonePlugin(request: ClonePluginRequest): Promise<PluginRevision> {
    return clonePlugin(request);
  }
}

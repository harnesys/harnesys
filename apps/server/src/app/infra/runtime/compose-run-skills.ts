import type { SkillRegistry } from 'harnesys';
import { composeSkillRegistries } from 'harnesys';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import type { SourceSkillsPort } from '../../domain/skills/source-skills.port.ts';

export interface RunSourceRef {
  id: string;
  name: string;
  root: string;
}

export interface ComposeRunSkillsInput {
  orgSkills: SkillRegistry;
  discovery: SourceSkillsPort;
  sources: RunSourceRef[];
  autoLoad: boolean;
}

export async function composeRunSkills(input: ComposeRunSkillsInput): Promise<SkillRegistry> {
  if (!input.autoLoad || input.sources.length === 0) {
    return input.orgSkills;
  }
  const ordered = [...input.sources].sort((a, b) => a.name.localeCompare(b.name));
  const registries: SkillRegistry[] = [input.orgSkills];
  for (const source of ordered) {
    const scan = await input.discovery.scan(source.root);
    registries.push(
      new FsSkillRegistry({ roots: [], skillDirs: scan.skillDirs.map((dir) => dir.dir) }),
    );
  }
  return composeSkillRegistries(registries);
}

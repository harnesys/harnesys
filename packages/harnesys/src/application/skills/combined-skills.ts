import type { PackSkill } from '../../domain/pack.ts';
import type { SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';

function toSummary(skill: PackSkill): SkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
  };
}
export function combineSkillRegistries(
  fs: SkillRegistry | undefined,
  packSkills: PackSkill[],
): SkillRegistry {
  const packsByName = new Map<string, PackSkill>();
  for (const skill of packSkills) {
    if (!packsByName.has(skill.name)) {
      packsByName.set(skill.name, skill);
    }
  }
  let fsNames: Set<string> | null = null;
  const readFsNames = async (): Promise<Set<string>> => {
    if (fs === undefined) {
      return new Set<string>();
    }
    if (fsNames === null) {
      fsNames = new Set((await fs.list()).map((s) => s.name));
    }
    return fsNames;
  };
  return {
    async list() {
      if (fs === undefined) {
        return [...packsByName.values()].map(toSummary);
      }
      const base = await fs.list();
      const names = new Set(base.map((s) => s.name));
      fsNames = names;
      const extra = [...packsByName.values()].filter((s) => !names.has(s.name)).map(toSummary);
      return [...base, ...extra];
    },
    async load(name: string) {
      const names = await readFsNames();
      if (fs !== undefined && names.has(name)) {
        return fs.load(name);
      }
      const packSkill = packsByName.get(name);
      if (packSkill !== undefined) {
        const files =
          packSkill.files === undefined ? undefined : Object.keys(packSkill.files).sort();
        return {
          ...toSummary(packSkill),
          instructions: packSkill.body,
          ...(files !== undefined ? { files } : {}),
        };
      }
      if (fs !== undefined) {
        return fs.load(name);
      }
      throw new Error(`unknown skill: ${name}`);
    },
    loadFile(name: string, relPath: string) {
      const packSkill = packsByName.get(name);
      if (packSkill !== undefined) {
        const content = packSkill.files?.[relPath];
        if (content !== undefined) {
          return { path: relPath, content };
        }
        if (fs === undefined) {
          throw new Error(`unknown skill file: ${name}/${relPath}`);
        }
      }
      if (fs !== undefined) {
        return fs.loadFile(name, relPath);
      }
      throw new Error(`unknown skill: ${name}`);
    },
    reload() {
      fsNames = null;
      return fs?.reload();
    },
  };
}

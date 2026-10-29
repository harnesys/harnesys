import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import type { CreateOrgSkillBody, OrgSkill, SkillSidecar } from '@harnesys/contracts';
import { SkillSidecarSchema } from '@harnesys/contracts';
import { parseSkillFile } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { OrgSkillsPort } from '../../domain/skills/org-skills.port.ts';
import {
  SkillConflictException,
  SkillNotFoundException,
  SkillValidationException,
} from '../../domain/skills/skills.error.ts';
import { SKILL_NAME_RE } from './skill-name.ts';

const SIDECAR_FILE = '.harnesys-skill.json';
const DIR_MODE = 0o700;

function hasFsCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

@Injectable()
export class OrgSkillsAdapter extends OrgSkillsPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): OrgSkill[] {
    const root = this.layout.skillsDir(orgId);
    if (!existsSync(root)) {
      return [];
    }
    const skills: OrgSkill[] = [];
    for (const name of readdirSync(root, { withFileTypes: true })) {
      if (!name.isDirectory()) {
        continue;
      }
      const skillPath = join(root, name.name, 'SKILL.md');
      if (!existsSync(skillPath)) {
        continue;
      }
      try {
        const doc = parseSkillFile(readFileSync(skillPath, 'utf8'), skillPath);
        const sidecar = this.readSidecar(orgId, doc.name);
        skills.push({
          name: doc.name,
          description: doc.description,
          ...(doc.whenToUse !== undefined ? { whenToUse: doc.whenToUse } : {}),
          origin: { kind: 'org' },
          path: join(root, name.name),
          ...(sidecar !== undefined ? { installedFrom: sidecar.url } : {}),
          canDelete: true,
          canUpdate: sidecar !== undefined,
          loadable: true,
        });
      } catch {}
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  create(orgId: string, body: CreateOrgSkillBody): OrgSkill {
    if (body.description.trim().length === 0) {
      throw new SkillValidationException('description is required');
    }
    if (body.instructions.trim().length === 0) {
      throw new SkillValidationException('instructions is required');
    }
    const root = this.layout.ensureSkillsDir(orgId);
    const skillDir = join(root, body.name);
    try {
      mkdirSync(skillDir, { mode: DIR_MODE });
    } catch (error) {
      if (hasFsCode(error, 'EEXIST')) {
        throw new SkillConflictException(`skill ${body.name} already exists`);
      }
      throw error;
    }
    writeFileSync(join(skillDir, 'SKILL.md'), formatSkillMarkdown(body), 'utf8');
    return {
      name: body.name,
      description: body.description.trim(),
      ...(body.whenToUse !== undefined ? { whenToUse: body.whenToUse } : {}),
      origin: { kind: 'org' },
      canDelete: true,
      canUpdate: false,
      loadable: true,
    };
  }

  remove(orgId: string, name: string): void {
    if (!SKILL_NAME_RE.test(name)) {
      throw new SkillValidationException(`invalid skill name: ${name}`);
    }
    const dir = join(this.layout.skillsDir(orgId), name);
    if (!existsSync(dir)) {
      throw new SkillNotFoundException(`skill ${name} not found`);
    }
    rmSync(dir, { recursive: true, force: true });
  }

  readSidecar(orgId: string, name: string): SkillSidecar | undefined {
    if (!SKILL_NAME_RE.test(name)) {
      return undefined;
    }
    const file = join(this.layout.skillsDir(orgId), name, SIDECAR_FILE);
    if (!existsSync(file)) {
      return undefined;
    }
    try {
      return SkillSidecarSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      return undefined;
    }
  }

  writeSkillDirAtomic(orgId: string, name: string, sourceDir: string, sidecar: SkillSidecar): void {
    if (!SKILL_NAME_RE.test(name)) {
      throw new SkillValidationException(`invalid skill name: ${name}`);
    }
    const root = this.layout.ensureSkillsDir(orgId);
    const dest = join(root, name);
    try {
      mkdirSync(dest, { mode: DIR_MODE });
    } catch (error) {
      if (hasFsCode(error, 'EEXIST')) {
        throw new SkillConflictException(`skill ${name} already exists`);
      }
      throw error;
    }
    try {
      cpSync(sourceDir, dest, { recursive: true });
    } catch (error) {
      rmSync(dest, { recursive: true, force: true });
      throw error;
    }
    writeFileSync(join(dest, SIDECAR_FILE), JSON.stringify(sidecar, null, 2), 'utf8');
  }
}

function formatSkillMarkdown(input: CreateOrgSkillBody): string {
  const lines = [
    '---',
    `name: ${yamlString(input.name)}`,
    `description: ${yamlString(input.description.trim())}`,
  ];
  if (input.whenToUse !== undefined && input.whenToUse.length > 0) {
    lines.push(`when_to_use: ${yamlString(input.whenToUse)}`);
  }
  lines.push('---', '', input.instructions.trim(), '');
  return lines.join('\n');
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

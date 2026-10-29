import { SQLiteError } from 'bun:sqlite';
import { Injectable } from '@harnesys/brix';
import type { ModeOpPermissions, ModeToolExposure, PackAssignmentBody } from '@harnesys/contracts';
import { and, eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { builtinModePresetSeed } from '../../domain/mode-presets/builtin-mode-presets.ts';
import {
  ModePresetConflictException,
  ModePresetNotFoundException,
  ModePresetValidationException,
} from '../../domain/mode-presets/mode-preset.error.ts';
import type {
  ModePresetInsert,
  ModePresetPatch,
  ModePresetRecord,
} from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { type ModePresetRow, modePresetsTable } from '../org-sqlite/schema/index.ts';

@Injectable()
export class ModePresetRegistryAdapter extends ModePresetRegistryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  list(orgId: string): ModePresetRecord[] {
    this.ensureSeeded(orgId);
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(modePresetsTable)
        .where(eq(modePresetsTable.orgId, orgId))
        .all()
        .map(toRecord),
    );
  }

  findById(orgId: string, id: string): ModePresetRecord | undefined {
    this.ensureSeeded(orgId);
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(modePresetsTable)
        .where(and(eq(modePresetsTable.orgId, orgId), eq(modePresetsTable.id, id)))
        .get();
      return row ? toRecord(row) : undefined;
    });
  }

  insert(rec: ModePresetInsert): ModePresetRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db.insert(modePresetsTable).values(toInsert(rec)).returning().get();
        return toRecord(row);
      } catch (err) {
        throw mapModePresetSqliteError(err);
      }
    });
  }

  update(orgId: string, id: string, patch: ModePresetPatch): ModePresetRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      try {
        const existing = db
          .select()
          .from(modePresetsTable)
          .where(and(eq(modePresetsTable.orgId, orgId), eq(modePresetsTable.id, id)))
          .get();
        if (!existing) {
          throw new ModePresetNotFoundException(id);
        }
        const merged = applyPatch(toRecord(existing), patch);
        const row = db
          .update(modePresetsTable)
          .set(toInsert(merged))
          .where(and(eq(modePresetsTable.orgId, orgId), eq(modePresetsTable.id, id)))
          .returning()
          .get();
        return toRecord(row);
      } catch (err) {
        throw mapModePresetSqliteError(err);
      }
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(modePresetsTable)
        .where(and(eq(modePresetsTable.orgId, orgId), eq(modePresetsTable.id, id)))
        .get();
      if (!existing) {
        throw new ModePresetNotFoundException(id);
      }
      db.delete(modePresetsTable)
        .where(and(eq(modePresetsTable.orgId, orgId), eq(modePresetsTable.id, id)))
        .run();
    });
  }

  ensureSeeded(orgId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const count = db
        .select()
        .from(modePresetsTable)
        .where(eq(modePresetsTable.orgId, orgId))
        .all().length;
      if (count > 0) {
        return;
      }
      const now = new Date().toISOString();
      for (const seed of builtinModePresetSeed()) {
        db.insert(modePresetsTable)
          .values(
            toInsert({
              orgId,
              id: seed.id,
              name: seed.name,
              description: seed.description,
              instructions: seed.instructions ?? '',
              skills: seed.skills ?? [],
              packs: seed.packs ?? {},
              permissions: seed.permissions ?? {},
              builtin: true,
              installedByDefault: seed.installedByDefault,
              createdAt: now,
              updatedAt: now,
            }),
          )
          .onConflictDoNothing()
          .run();
      }
    });
  }
}

function toRecord(row: ModePresetRow): ModePresetRecord {
  return {
    orgId: row.orgId,
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    skills: parseJsonArray(row.skillsJson),
    packs: parseJsonRecord(row.packsJson),
    disabledTools: parseStringArray(row.disabledToolsJson),
    exposure: parseExposureMap(row.exposureJson),
    permissions: parseJsonPermissions(row.permissionsJson),
    builtin: row.builtin,
    installedByDefault: row.installedByDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInsert(rec: ModePresetRecord | ModePresetInsert) {
  return {
    orgId: rec.orgId,
    id: rec.id,
    name: rec.name,
    description: rec.description,
    instructions: rec.instructions,
    skillsJson: JSON.stringify(rec.skills),
    packsJson: JSON.stringify(rec.packs),
    disabledToolsJson: JSON.stringify(rec.disabledTools ?? []),
    exposureJson: JSON.stringify(rec.exposure ?? {}),
    permissionsJson: JSON.stringify(rec.permissions),
    builtin: rec.builtin,
    installedByDefault: rec.installedByDefault,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function applyPatch(current: ModePresetRecord, patch: ModePresetPatch): ModePresetRecord {
  return {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
    ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
    ...(patch.packs !== undefined ? { packs: patch.packs } : {}),
    ...(patch.disabledTools !== undefined ? { disabledTools: patch.disabledTools } : {}),
    ...(patch.exposure !== undefined ? { exposure: patch.exposure } : {}),
    ...(patch.permissions !== undefined ? { permissions: patch.permissions } : {}),
    ...(patch.installedByDefault !== undefined
      ? { installedByDefault: patch.installedByDefault }
      : {}),
    updatedAt: patch.updatedAt,
  };
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(raw: string): Record<string, PackAssignmentBody> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, PackAssignmentBody>;
  } catch {
    return {};
  }
}

function parseJsonPermissions(raw: string): ModeOpPermissions {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as ModeOpPermissions;
  } catch {
    return {};
  }
}

function mapModePresetSqliteError(err: unknown): never {
  if (err instanceof ModePresetNotFoundException || err instanceof ModePresetConflictException) {
    throw err;
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new ModePresetConflictException('mode preset id or name taken');
  }
  if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    throw new ModePresetConflictException('mode preset id taken');
  }
  if (err instanceof Error) {
    throw new ModePresetValidationException(err.message);
  }
  throw err;
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseExposureMap(raw: string): Record<string, ModeToolExposure> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, ModeToolExposure> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'direct' || value === 'deferred') {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

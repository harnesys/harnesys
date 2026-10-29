import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@harnesys/brix';
import {
  type AgentPresetBody,
  AgentPresetBodySchema,
  type PresetKind,
  type TeamPresetBody,
  TeamPresetBodySchema,
} from '@harnesys/contracts';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { bundledAssetsRoot, bundledPresetsPath, PRESET_ID_RE } from '../../../const.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { PresetRecord } from '../../domain/presets/preset-library.port.ts';
import { withMachineSqlite } from '../plugins/machine-sqlite-session.ts';
import { toPresetRecord, toPresetRow } from './preset-rows.ts';
import { type PresetRow, presetsTable } from './presets.schema.ts';

const SYSTEM_OWNER = 'harnesys';
const SYSTEM_VERSION = '1.0.0';

const agentAssetSchema = AgentPresetBodySchema.extend({
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const teamAssetSchema = TeamPresetBodySchema.extend({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export interface SystemPresetPlan {
  upserts: PresetRecord[];
  deletes: string[];
}

export interface SystemPresetSeedResult {
  upserted: number;
  deleted: number;
  skipped: number;
}

export function planSystemPresets(
  bundle: PresetRecord[],
  existingSystem: PresetRecord[],
): SystemPresetPlan {
  const bundleIds = new Set(bundle.map((record) => record.id));
  return {
    upserts: [...bundle],
    deletes: existingSystem
      .filter((record) => !bundleIds.has(record.id))
      .map((record) => record.id),
  };
}

export function systemPresetsSeed(opts: {
  layout: HostFsLayoutPort;
  log: Logger;
}): SystemPresetSeedResult {
  const bundle = readBundledPresets(opts.log);
  return withMachineSqlite(opts.layout, (db) => {
    const existingRows = db
      .select()
      .from(presetsTable)
      .where(eq(presetsTable.origin, 'system'))
      .all();
    const plan = planSystemPresets(bundle, existingRows.map(toExistingRecord));
    const now = new Date().toISOString();
    db.transaction((tx) => {
      for (const record of plan.upserts) {
        const existing = tx.select().from(presetsTable).where(eq(presetsTable.id, record.id)).get();
        const values = toPresetRow({
          ...record,
          origin: 'system',
          version: SYSTEM_VERSION,
          installedFrom: null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        tx.insert(presetsTable)
          .values(values)
          .onConflictDoUpdate({
            target: presetsTable.id,
            set: {
              kind: values.kind,
              origin: values.origin,
              version: values.version,
              name: values.name,
              description: values.description,
              body: values.body,
              author: values.author,
              installedFrom: values.installedFrom,
              tags: values.tags,
              updatedAt: values.updatedAt,
            },
          })
          .run();
      }
      for (const id of plan.deletes) {
        tx.delete(presetsTable).where(eq(presetsTable.id, id)).run();
      }
    });
    return { upserted: plan.upserts.length, deleted: plan.deletes.length, skipped: 0 };
  });
}

export function readBundledPresets(log: Logger): PresetRecord[] {
  const records: PresetRecord[] = [];
  for (const file of listAssetFiles(bundledPresetsPath('agents'))) {
    const record = readAgentAsset(file, log);
    if (record !== null) {
      records.push(record);
    }
  }
  for (const file of listAssetFiles(join(bundledAssetsRoot(), 'presets', 'teams'))) {
    const record = readTeamAsset(file, log);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

function listAssetFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => PRESET_ID_RE.test(name.slice(0, -'.json'.length)))
    .sort();
}

function readAgentAsset(file: string, log: Logger): PresetRecord | null {
  const path = join(bundledPresetsPath('agents'), file);
  const parsed = agentAssetSchema.safeParse(readJson(path));
  if (!parsed.success) {
    log.warn({ path, issues: parsed.error.issues }, 'system agent preset skipped');
    return null;
  }
  const { description, tags, ...body } = parsed.data;
  return {
    id: `${SYSTEM_OWNER}/${stemOf(file)}`,
    kind: 'agent',
    origin: 'system',
    version: SYSTEM_VERSION,
    name: body.name,
    description: description ?? null,
    body: body as AgentPresetBody,
    author: null,
    installedFrom: null,
    tags: tags ?? [],
    createdAt: '',
    updatedAt: '',
  };
}

function readTeamAsset(file: string, log: Logger): PresetRecord | null {
  const path = join(bundledAssetsRoot(), 'presets', 'teams', file);
  const parsed = teamAssetSchema.safeParse(readJson(path));
  if (!parsed.success) {
    log.warn({ path, issues: parsed.error.issues }, 'system team preset skipped');
    return null;
  }
  const { name, description, tags, ...body } = parsed.data;
  return {
    id: `${SYSTEM_OWNER}/${stemOf(file)}`,
    kind: 'team',
    origin: 'system',
    version: SYSTEM_VERSION,
    name,
    description: description ?? null,
    body: body as TeamPresetBody,
    author: null,
    installedFrom: null,
    tags: tags ?? [],
    createdAt: '',
    updatedAt: '',
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function stemOf(file: string): string {
  return file.slice(0, -'.json'.length);
}

function toExistingRecord(row: PresetRow): PresetRecord {
  try {
    return toPresetRecord(row);
  } catch {
    const kind: PresetKind = row.kind === 'team' ? 'team' : 'agent';
    return {
      id: row.id,
      kind,
      origin: 'system',
      version: row.version,
      name: row.name,
      description: row.description,
      body: { name: row.name, role: 'unknown', instructions: 'unknown' },
      author: row.author,
      installedFrom: row.installedFrom,
      tags: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '@harnesys/brix';
import { AgentPresetBodySchema } from '@harnesys/contracts';
import { PRESET_ID_RE, systemPresetsPath } from '../../../const.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { PresetRecord } from '../../domain/presets/preset-library.port.ts';
import { PresetRepositoryAdapter } from './preset-repository.adapter.ts';

export const LEGACY_IMPORT_MARKER = '.legacy-agents-imported';

export interface LegacyImportResult {
  imported: number;
  skipped: boolean;
}

export function parseLegacyAgentPreset(fileName: string, text: string): PresetRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = AgentPresetBodySchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const stem = fileName.endsWith('.json') ? fileName.slice(0, -'.json'.length) : fileName;
  if (!PRESET_ID_RE.test(stem)) {
    return null;
  }
  return {
    id: `local/${stem}`,
    kind: 'agent',
    origin: 'user',
    version: '1.0.0',
    name: parsed.data.name,
    description: null,
    body: parsed.data,
    author: null,
    installedFrom: 'file',
    tags: [],
    createdAt: '',
    updatedAt: '',
  };
}

export function importLegacyUserPresets(opts: {
  layout: HostFsLayoutPort;
  log: Logger;
}): LegacyImportResult {
  const home = opts.layout.home();
  const marker = join(home, 'presets', LEGACY_IMPORT_MARKER);
  if (existsSync(marker)) {
    return { imported: 0, skipped: true };
  }
  const dir = systemPresetsPath('agents', home);
  const repository = new PresetRepositoryAdapter(opts.layout);
  let imported = 0;
  for (const file of listLegacyFiles(dir)) {
    const record = parseLegacyAgentPreset(file, readFileSync(join(dir, file), 'utf8'));
    if (record === null) {
      opts.log.warn({ file }, 'legacy agent preset skipped');
      continue;
    }
    try {
      repository.save({
        id: record.id,
        kind: record.kind,
        origin: record.origin,
        version: record.version,
        name: record.name,
        description: record.description,
        author: record.author,
        installedFrom: record.installedFrom,
        tags: record.tags,
        body: record.body,
      });
      imported += 1;
    } catch (error) {
      opts.log.warn({ file, error }, 'legacy agent preset import failed');
    }
  }
  writeMarker(marker);
  return { imported, skipped: false };
}

function listLegacyFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function writeMarker(marker: string): void {
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()}\n`);
}

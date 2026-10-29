import type {
  AgentPresetBody,
  CatalogItem,
  PresetDetail,
  TeamPresetBody,
} from '@harnesys/contracts';
import type { PresetRecord } from './preset-library.port.ts';

export function toCatalogItem(record: PresetRecord): CatalogItem {
  if (record.kind === 'team') {
    const body = record.body as TeamPresetBody;
    return {
      kind: 'team',
      id: record.id,
      origin: record.origin,
      version: record.version,
      name: record.name,
      ...(record.description !== null ? { description: record.description } : {}),
      ...(record.author !== null ? { author: record.author } : {}),
      tags: record.tags,
      ...(record.installedFrom !== null ? { installedFrom: record.installedFrom } : {}),
      roles: body.roles.map((role) => ({ roleKey: role.roleKey, name: role.name })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
  const body = record.body as AgentPresetBody;
  return {
    kind: 'agent',
    id: record.id,
    origin: record.origin,
    version: record.version,
    name: record.name,
    ...(record.description !== null ? { description: record.description } : {}),
    ...(record.author !== null ? { author: record.author } : {}),
    tags: record.tags,
    ...(record.installedFrom !== null ? { installedFrom: record.installedFrom } : {}),
    role: body.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toPresetDetail(record: PresetRecord): PresetDetail {
  if (record.kind === 'team') {
    const body = record.body as TeamPresetBody;
    return {
      kind: 'team',
      id: record.id,
      origin: record.origin,
      version: record.version,
      name: record.name,
      ...(record.description !== null ? { description: record.description } : {}),
      ...(record.author !== null ? { author: record.author } : {}),
      tags: record.tags,
      ...(record.installedFrom !== null ? { installedFrom: record.installedFrom } : {}),
      roles: body.roles.map((role) => ({ roleKey: role.roleKey, name: role.name })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      body,
    };
  }
  const body = record.body as AgentPresetBody;
  return {
    kind: 'agent',
    id: record.id,
    origin: record.origin,
    version: record.version,
    name: record.name,
    ...(record.description !== null ? { description: record.description } : {}),
    ...(record.author !== null ? { author: record.author } : {}),
    tags: record.tags,
    ...(record.installedFrom !== null ? { installedFrom: record.installedFrom } : {}),
    role: body.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    body,
  };
}

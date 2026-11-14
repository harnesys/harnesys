import type { z } from 'zod';
import { familyRegistry } from '../families/registry.ts';
import { isKnownPermissionId } from '../permissions/permissions.ts';
import { l10nKeys } from './l10n.ts';
import type { AddonManifest } from './manifest.ts';
import { AddonManifestSchema } from './manifest.ts';

export interface Violation {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ManifestValidation {
  manifest: AddonManifest | null;
  violations: Violation[];
}

interface CheckContext {
  manifest: AddonManifest;
  violations: Violation[];
  connectionIds: Set<string>;
  idsByKind: Record<string, Set<string>>;
  contributionIds: Set<string>;
}

export function validateManifest(
  raw: unknown,
  options?: { l10nKeys?: string[] },
): ManifestValidation {
  const violations: Violation[] = [];
  const parsed = AddonManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      violations.push({
        path: issue.path.map(String).join('.') || '(root)',
        code: 'schema',
        message: issue.message,
        severity: 'error',
      });
    }
    return { manifest: null, violations };
  }
  const context: CheckContext = {
    manifest: parsed.data,
    violations,
    connectionIds: new Set(parsed.data.connections.map((c) => c.id)),
    idsByKind: { route: new Set(), job: new Set(), worker: new Set() },
    contributionIds: new Set<string>(),
  };
  checkPermissions(context);
  checkContributions(context);
  checkL10nKeys(parsed.data, violations, options);
  return { manifest: parsed.data, violations };
}

function checkPermissions(context: CheckContext): void {
  const { manifest, violations } = context;
  for (const permission of manifest.permissions) {
    if (!isKnownPermissionId(permission.id)) {
      violations.push({
        path: `permissions[${permission.id}]`,
        code: 'unknown_permission',
        message: `unknown permission id '${permission.id}'`,
        severity: 'error',
      });
    }
  }
  if (
    manifest.activation === 'resident' &&
    !manifest.permissions.some((p) => p.id === 'lifecycle.resident')
  ) {
    violations.push({
      path: 'activation',
      code: 'resident_without_permission',
      message: `activation 'resident' requires the 'lifecycle.resident' permission`,
      severity: 'error',
    });
  }
}

function checkContributions(context: CheckContext): void {
  const { manifest, violations } = context;
  for (const [index, contribution] of manifest.contributions.entries()) {
    const path = `contributions[${contribution.id || index}]`;
    checkContributionId(context, contribution.id, path);
    const schema: z.ZodType | undefined = familyRegistry[contribution.family]?.schema(
      contribution.v ?? 1,
    );
    if (!schema) {
      violations.push({
        path,
        code: 'unknown_family',
        message: `unknown family '${contribution.family}'`,
        severity: contribution.optional === true ? 'warning' : 'error',
      });
      continue;
    }
    checkDescriptorSchema(path, contribution.descriptor, schema, violations);
    checkDescriptorRefs(context, path, contribution.family, contribution.descriptor);
  }
}

function checkContributionId(context: CheckContext, id: string, path: string): void {
  if (context.contributionIds.has(id)) {
    context.violations.push({
      path,
      code: 'duplicate_contribution_id',
      message: `duplicate contribution id '${id}'`,
      severity: 'error',
    });
  }
  context.contributionIds.add(id);
}

function checkDescriptorSchema(
  path: string,
  descriptor: Record<string, unknown>,
  schema: z.ZodType,
  violations: Violation[],
): void {
  const parsed = schema.safeParse(descriptor);
  if (parsed.success) {
    return;
  }
  for (const issue of parsed.error.issues) {
    violations.push({
      path: `${path}.descriptor.${issue.path.map(String).join('.')}`,
      code: 'descriptor_schema',
      message: issue.message,
      severity: 'error',
    });
  }
}

function checkDescriptorRefs(
  context: CheckContext,
  path: string,
  family: string,
  descriptor: Record<string, unknown>,
): void {
  const connection = descriptor.connection;
  if (typeof connection === 'string' && !context.connectionIds.has(connection)) {
    context.violations.push({
      path,
      code: 'unknown_connection',
      message: `descriptor references undeclared connection '${connection}'`,
      severity: 'error',
    });
  }
  checkUniqueEntityId(context, family, descriptor, path);
}

function checkUniqueEntityId(
  context: CheckContext,
  family: string,
  descriptor: Record<string, unknown>,
  path: string,
): void {
  const ids = context.idsByKind[family];
  if (!ids) {
    return;
  }
  const id = descriptor.id ?? descriptor.name ?? descriptor.kind ?? descriptor.provider;
  if (typeof id !== 'string') {
    return;
  }
  if (ids.has(id)) {
    context.violations.push({
      path,
      code: 'duplicate_id',
      message: `duplicate ${family} id '${id}'`,
      severity: 'error',
    });
  }
  ids.add(id);
}

function checkL10nKeys(
  manifest: AddonManifest,
  violations: Violation[],
  options?: { l10nKeys?: string[] },
): void {
  if (!options?.l10nKeys) {
    return;
  }
  const available = new Set(options.l10nKeys);
  const used = [...l10nKeys(manifest.title), ...l10nKeys(manifest.description)];
  for (const key of used) {
    if (!available.has(key)) {
      violations.push({
        path: 'title',
        code: 'missing_l10n_key',
        message: `l10n key '%${key}%' is not present in l10n/en.json`,
        severity: 'error',
      });
    }
  }
}

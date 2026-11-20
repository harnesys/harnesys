import type { AddonContext, RouteHandler } from '@harnesys/sdk';
import { testConnection } from './auth.ts';
import { parseOpenApiDocument } from './openapi/parse.ts';
import {
  createProject,
  deleteProject,
  getProject,
  normalizeAuthKind,
  projectNameTaken,
  secretKeyFor,
  updateProject,
} from './store.ts';
import { replaceOperations } from './store-operations.ts';
import type { AuthKind, ProjectRow } from './types.ts';
import {
  authLabel,
  optionalString,
  requireAuthKind,
  requireAuthParam,
  requireString,
  ValidationError,
} from './validate.ts';

export const projects: RouteHandler = async (_call, ctx) => {
  const all = await ctx.db.all(
    `select p.id as id, p.name as name, p.base_url as baseUrl, p.auth_kind as authKind,
            p.auth_param as authParam, p.spec_sha as specSha, p.updated_at as updatedAt,
            count(o.id) as totalOps
     from projects p
     left join operations o on o.project_id = p.id
     group by p.id
     order by p.name`,
  );
  return {
    status: 200,
    body: {
      rows: all.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        baseUrl: String(row.baseUrl ?? ''),
        security: securityOf(String(row.baseUrl ?? '')),
        authKind: normalizeKind(row.authKind),
        authParam:
          row.authParam === null || row.authParam === undefined ? null : String(row.authParam),
        auth: authLabel(
          normalizeKind(row.authKind),
          row.authParam === null || row.authParam === undefined ? null : String(row.authParam),
        ),
        specSha:
          typeof row.specSha === 'string' && row.specSha.length > 0
            ? row.specSha.slice(0, 12)
            : null,
        operations: Number(row.totalOps ?? 0),
        updatedAt: String(row.updatedAt ?? ''),
      })),
    },
  };
};

export const projectDelete: RouteHandler = async (call, ctx) => {
  const id = pathParam(call.request.path, 'delete');
  const existing = await requireProject(ctx, id);
  await deleteProject(ctx, existing.id);
  return {
    status: 200,
    body: {
      toast: `Project '${existing.name}' deleted with its operations and grants`,
      refresh: true,
    },
  };
};

export const projectEdit: RouteHandler = async (call, ctx) => {
  const id = pathParam(call.request.path, 'edit');
  const project = await requireProject(ctx, id);
  const body = objectOf(call.request.body, 'request body must be a JSON object');
  const name = optionalString(body, 'name');
  if (name !== undefined && name !== project.name) {
    await assertNameFree(ctx, name);
  }
  const rawAuthKind = optionalString(body, 'authKind');
  const authKind = rawAuthKind === undefined ? undefined : requireAuthKind(body);
  const authParam =
    authKind === undefined
      ? undefined
      : requireAuthParam(authKind, optionalString(body, 'authParam'));
  const specText = optionalString(body, 'spec');
  const specResult = specText === undefined ? null : await reimportSpec(ctx, project, specText);
  await updateProject(ctx, project.id, {
    ...(name !== undefined ? { name } : {}),
    ...(optionalString(body, 'baseUrl') !== undefined
      ? { baseUrl: optionalString(body, 'baseUrl') as string }
      : {}),
    ...(specResult?.baseUrl !== undefined ? { baseUrl: specResult.baseUrl } : {}),
    ...(authKind !== undefined ? { authKind } : {}),
    ...(authParam !== undefined ? { authParam } : {}),
  });
  const token = optionalString(body, 'token');
  const user = optionalString(body, 'user');
  let secretsNote = '';
  if (token !== undefined) {
    await ctx.secrets.set(secretKeyFor(project.id, 'token'), token);
    if (user !== undefined) {
      await ctx.secrets.set(secretKeyFor(project.id, 'user'), user);
    }
    secretsNote = ' Credentials updated.';
  }
  return {
    status: 200,
    body: {
      toast: `Project '${name ?? project.name}' updated; grants are preserved.${secretsNote}${specResult?.note ?? ''}`,
      refresh: true,
    },
  };
};

async function reimportSpec(
  ctx: AddonContext,
  project: ProjectRow,
  specText: string,
): Promise<{ baseUrl?: string; note: string }> {
  const parsed = parseOpenApiDocument(parseSpecText(specText));
  const specSha = await sha256Hex(specText);
  const result = await replaceOperations(ctx, project.id, parsed.operations, specSha);
  const warnings = parsed.warnings.length > 0 ? ` Warnings: ${parsed.warnings.join(' ')}` : '';
  return {
    ...(project.baseUrl.length === 0 && parsed.baseUrlHint !== null
      ? { baseUrl: parsed.baseUrlHint }
      : {}),
    note: ` Spec re-imported: ${parsed.operations.length} operations (+${result.added} new, ${result.updated} updated, ${result.removed} removed).${warnings}`,
  };
}

function securityOf(baseUrl: string): string {
  if (baseUrl.length === 0) {
    return 'unknown';
  }
  return baseUrl.startsWith('https://') ? 'secure' : 'insecure';
}

export const projectImport: RouteHandler = async (call, ctx) => {
  const body = objectOf(call.request.body, 'request body must be a JSON object');
  const specText = requireString(body, 'spec');
  const document = parseSpecText(specText);
  const parsed = parseOpenApiDocument(document);
  const specSha = await sha256Hex(specText);
  const project = await createImportedProject(ctx, body, parsed.baseUrlHint);
  const rawAuthKind = optionalString(body, 'authKind');
  const authKind = rawAuthKind === undefined ? undefined : requireAuthKind(body);
  const authParam =
    authKind === undefined
      ? undefined
      : requireAuthParam(authKind, optionalString(body, 'authParam'));
  const patch = {
    ...(optionalString(body, 'baseUrl') !== undefined
      ? { baseUrl: optionalString(body, 'baseUrl') as string }
      : {}),
    ...(authKind !== undefined ? { authKind } : {}),
    ...(authParam !== undefined ? { authParam } : {}),
    ...(project.baseUrl.length === 0 && parsed.baseUrlHint !== null
      ? { baseUrl: parsed.baseUrlHint }
      : {}),
  };
  await updateProject(ctx, project.id, patch);
  const tokenNote = await saveCredentials(ctx, project.id, authKind ?? project.authKind, body);
  const result = await replaceOperations(ctx, project.id, parsed.operations, specSha);
  const warnings = parsed.warnings.length > 0 ? ` Warnings: ${parsed.warnings.join(' ')}` : '';
  return {
    status: 200,
    body: {
      id: project.id,
      toast: `Imported ${parsed.operations.length} operations (+${result.added} new, ${result.updated} updated, ${result.removed} removed).${tokenNote}${warnings}`,
      refresh: true,
    },
  };
};

async function saveCredentials(
  ctx: AddonContext,
  projectId: string,
  currentAuthKind: AuthKind,
  body: Record<string, unknown>,
): Promise<string> {
  const token = optionalString(body, 'token');
  if (token === undefined) {
    return currentAuthKind === 'none'
      ? ''
      : ' Token is not set; re-import with an auth kind and token if this API needs one.';
  }
  await ctx.secrets.set(secretKeyFor(projectId, 'token'), token);
  const user = optionalString(body, 'user');
  if (user !== undefined) {
    await ctx.secrets.set(secretKeyFor(projectId, 'user'), user);
  }
  return ' Token saved.';
}

export const projectTest: RouteHandler = async (call, ctx) => {
  const id = pathParam(call.request.path, 'test');
  const project = await requireProject(ctx, id);
  const result = await testConnection(ctx, project);
  const summary = result.ok
    ? `Reachable: HTTP ${result.status} in ${result.latencyMs} ms`
    : `Failed: ${result.error ?? `HTTP ${result.status}`}`;
  return { status: 200, body: { toast: summary, refresh: false } };
};

async function createImportedProject(
  ctx: AddonContext,
  body: Record<string, unknown>,
  baseUrlHint: string | null,
): Promise<ProjectRow> {
  const name = requireString(body, 'name');
  const authKind = requireAuthKind(body);
  const authParam = requireAuthParam(authKind, optionalString(body, 'authParam'));
  await assertNameFree(ctx, name);
  return createProject(ctx, {
    name,
    baseUrl: optionalString(body, 'baseUrl') ?? baseUrlHint ?? '',
    authKind,
    authParam,
  });
}

async function requireProject(ctx: AddonContext, id: string): Promise<ProjectRow> {
  const project = await getProject(ctx, id);
  if (project === null) {
    throw new ValidationError(`project '${id}' does not exist`);
  }
  return project;
}

async function assertNameFree(ctx: AddonContext, name: string): Promise<void> {
  if (await projectNameTaken(ctx, name)) {
    throw new ValidationError(`project name '${name}' is already in use`);
  }
}

function normalizeKind(value: unknown): AuthKind {
  return normalizeAuthKind(value) ?? 'none';
}

function parseSpecText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError('spec is not valid JSON; paste the OpenAPI document as JSON');
  }
}

function objectOf(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(message);
  }
  return value as Record<string, unknown>;
}

function pathParam(path: string, after: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const index = segments.indexOf(after);
  const value = index >= 0 ? segments[index + 1] : undefined;
  if (value === undefined || value.length === 0) {
    throw new ValidationError(`path parameter is missing (expected after '${after}')`);
  }
  return value;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

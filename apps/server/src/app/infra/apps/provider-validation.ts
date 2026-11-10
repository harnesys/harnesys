import { z } from 'zod';
import type {
  AccountKindModule,
  AppKindModule,
  ProviderModule,
} from '../../domain/apps/provider-module.ts';

const KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const PROVIDER_PATTERN = /^[a-z][a-z0-9]*$/;
const FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const HOST_PATTERN = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

const FieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const FieldSpecSchema = z.object({
  key: z.string().regex(FIELD_KEY_PATTERN),
  label: z.string().min(1),
  type: z.enum(['text', 'secret', 'textarea', 'url', 'select', 'number', 'boolean']),
  required: z.boolean(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  default: FieldValueSchema.optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  pattern: z.object({ regex: z.string(), hint: z.string() }).optional(),
  editable: z.boolean().optional(),
  generated: z.boolean().optional(),
});

const HelpSchema = z.object({ steps: z.array(z.string()), consoleUrl: z.string().nullable() });

const AppDescriptorSchema = z.object({
  kind: z.string().regex(KEY_PATTERN),
  provider: z.string(),
  label: z.string().min(1),
  description: z.string(),
  fields: z.array(FieldSpecSchema),
  help: HelpSchema,
  endpoints: z.array(z.enum(['redirectUri', 'webhookUrl'])),
});

const AccountDescriptorSchema = z.object({
  kind: z.string().regex(KEY_PATTERN),
  provider: z.string(),
  label: z.string().min(1),
  description: z.string(),
  requiresApp: z.array(z.string()),
  inputs: z.array(FieldSpecSchema),
  scopes: z.object({
    options: z.array(
      z.object({ key: z.string(), label: z.string(), description: z.string().optional() }),
    ),
    defaults: z.array(z.string()),
  }),
  access: z.object({
    source: z.enum(['stored', 'derived']),
    keys: z.array(z.string()),
  }),
  endpoints: z.array(z.enum(['webhookUrl'])),
});

export interface ValidatedRegistry {
  modules: readonly ProviderModule[];
  appKinds: Map<string, AppKindModule>;
  accountKinds: Map<string, AccountKindModule>;
  providerByKind: Map<string, ProviderModule>;
}

export function validateRegistry(modules: readonly ProviderModule[]): ValidatedRegistry {
  const violations: string[] = [];
  const providerIds = new Set<string>();
  const appKinds = new Map<string, AppKindModule>();
  const accountKinds = new Map<string, AccountKindModule>();
  const providerByKind = new Map<string, ProviderModule>();
  for (const module of modules) {
    validateProvider(module, providerIds, violations);
    registerAppKinds(module, appKinds, accountKinds, providerByKind, violations);
    registerAccountKinds(module, appKinds, accountKinds, providerByKind, violations);
    if (module.accountKinds.length === 0) {
      violations.push(`provider ${module.descriptor.id} has no account kinds`);
    }
  }
  validateRequiredApps(accountKinds, appKinds, violations);
  if (violations.length > 0) {
    throw new Error(`Invalid provider registry:\n- ${violations.join('\n- ')}`);
  }
  return { modules, appKinds, accountKinds, providerByKind };
}

function validateProvider(
  module: ProviderModule,
  providerIds: Set<string>,
  violations: string[],
): void {
  const id = module.descriptor.id;
  if (!PROVIDER_PATTERN.test(id)) {
    violations.push(`provider id ${id} must match ${PROVIDER_PATTERN}`);
  }
  if (providerIds.has(id)) {
    violations.push(`provider id ${id} is duplicated`);
  }
  providerIds.add(id);
  if (!module.descriptor.label) {
    violations.push(`provider ${id} has an empty label`);
  }
}

function validateKindPrefix(module: ProviderModule, kind: string, violations: string[]): void {
  if (!KEY_PATTERN.test(kind)) {
    violations.push(`kind ${kind} must match ${KEY_PATTERN}`);
  }
  if (!kind.startsWith(`${module.descriptor.id}-`)) {
    violations.push(`kind ${kind} must start with ${module.descriptor.id}-`);
  }
}

function validateAppKind(kind: AppKindModule, violations: string[]): void {
  const result = AppDescriptorSchema.safeParse(kind.descriptor);
  if (!result.success) {
    violations.push(`app kind ${kind.descriptor.kind} descriptor: ${result.error.message}`);
    return;
  }
  validateFields(kind.descriptor.kind, kind.descriptor.fields, violations);
  validateSecrets(kind.descriptor.kind, kind.descriptor.fields, kind.secrets, violations);
  validateEgress(kind.descriptor.kind, kind.egress, kind.descriptor.fields, violations);
  validateEndpoint(
    kind.descriptor.kind,
    kind.descriptor.endpoints,
    kind.webhook !== undefined,
    violations,
  );
  if (kind.descriptor.provider === '') {
    violations.push(`app kind ${kind.descriptor.kind} has an empty provider`);
  }
}

function validateAccountKind(kind: AccountKindModule, violations: string[]): void {
  const result = AccountDescriptorSchema.safeParse(kind.descriptor);
  if (!result.success) {
    violations.push(`account kind ${kind.descriptor.kind} descriptor: ${result.error.message}`);
    return;
  }
  validateFields(kind.descriptor.kind, kind.descriptor.inputs, violations);
  validateSecrets(kind.descriptor.kind, kind.descriptor.inputs, kind.secrets, violations);
  validateEgress(kind.descriptor.kind, kind.egress, kind.descriptor.inputs, violations);
  validateEndpoint(
    kind.descriptor.kind,
    kind.descriptor.endpoints,
    kind.webhook !== undefined,
    violations,
  );
  validateDefaultScopes(kind, violations);
  validateAccess(kind, violations);
}

function registerAppKinds(
  module: ProviderModule,
  appKinds: Map<string, AppKindModule>,
  accountKinds: Map<string, AccountKindModule>,
  providerByKind: Map<string, ProviderModule>,
  violations: string[],
): void {
  for (const appKind of module.appKinds) {
    const kind = appKind.descriptor.kind;
    validateKindPrefix(module, kind, violations);
    if (appKinds.has(kind) || accountKinds.has(kind)) {
      violations.push(`kind ${kind} is declared more than once`);
    }
    if (appKind.descriptor.provider !== module.descriptor.id) {
      violations.push(
        `app kind ${kind} provider ${appKind.descriptor.provider} does not match ${module.descriptor.id}`,
      );
    }
    appKinds.set(kind, appKind);
    providerByKind.set(kind, module);
    validateAppKind(appKind, violations);
  }
}

function registerAccountKinds(
  module: ProviderModule,
  appKinds: Map<string, AppKindModule>,
  accountKinds: Map<string, AccountKindModule>,
  providerByKind: Map<string, ProviderModule>,
  violations: string[],
): void {
  for (const accountKind of module.accountKinds) {
    const kind = accountKind.descriptor.kind;
    validateKindPrefix(module, kind, violations);
    if (appKinds.has(kind) || accountKinds.has(kind)) {
      violations.push(`kind ${kind} is declared more than once`);
    }
    if (accountKind.descriptor.provider !== module.descriptor.id) {
      violations.push(
        `account kind ${kind} provider ${accountKind.descriptor.provider} does not match ${module.descriptor.id}`,
      );
    }
    accountKinds.set(kind, accountKind);
    providerByKind.set(kind, module);
    validateAccountKind(accountKind, violations);
  }
}

function validateRequiredApps(
  accountKinds: Map<string, AccountKindModule>,
  appKinds: Map<string, AppKindModule>,
  violations: string[],
): void {
  for (const kind of accountKinds.values()) {
    for (const required of kind.descriptor.requiresApp) {
      if (!appKinds.has(required)) {
        violations.push(
          `account kind ${kind.descriptor.kind} requires unknown app kind ${required}`,
        );
      }
    }
  }
}

function validateDefaultScopes(kind: AccountKindModule, violations: string[]): void {
  const known = new Set(kind.descriptor.scopes.options.map((option) => option.key));
  for (const scope of kind.descriptor.scopes.defaults) {
    if (!known.has(scope)) {
      violations.push(
        `account kind ${kind.descriptor.kind} default scope ${scope} is not in options`,
      );
    }
  }
}

function validateAccess(kind: AccountKindModule, violations: string[]): void {
  if (kind.descriptor.access.source === 'stored') {
    for (const key of kind.descriptor.access.keys) {
      if (!kind.secrets.includes(key)) {
        violations.push(
          `account kind ${kind.descriptor.kind} access key ${key} is not declared in secrets`,
        );
      }
    }
    return;
  }
  if (!kind.access) {
    violations.push(`account kind ${kind.descriptor.kind} is derived but has no access handler`);
  }
}

function validateFields(
  kind: string,
  fields: readonly { key: string }[],
  violations: string[],
): void {
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) {
      violations.push(`kind ${kind} has duplicate field key ${field.key}`);
    }
    keys.add(field.key);
  }
  for (const field of fields as Array<{
    key: string;
    type: string;
    options?: unknown[];
    pattern?: { regex: string };
    generated?: boolean;
    editable?: boolean;
  }>) {
    validateFieldSpec(kind, field, violations);
  }
}

function validateFieldSpec(
  kind: string,
  field: {
    key: string;
    type: string;
    options?: unknown[];
    pattern?: { regex: string };
    generated?: boolean;
    editable?: boolean;
  },
  violations: string[],
): void {
  if (field.type === 'select' && (field.options ?? []).length === 0) {
    violations.push(`kind ${kind} field ${field.key} is select without options`);
  }
  if (field.pattern && !isValidPattern(field.pattern.regex)) {
    violations.push(`kind ${kind} field ${field.key} has an invalid pattern`);
  }
  if (field.generated && field.type !== 'secret') {
    violations.push(`kind ${kind} field ${field.key} is generated but not secret`);
  }
  if (field.editable && field.type === 'secret') {
    violations.push(`kind ${kind} field ${field.key} is editable but secret`);
  }
}

function isValidPattern(regex: string): boolean {
  try {
    new RegExp(regex);
    return true;
  } catch {
    return false;
  }
}

function validateSecrets(
  kind: string,
  fields: readonly { key: string; type: string; generated?: boolean }[],
  secrets: readonly string[],
  violations: string[],
): void {
  const unique = new Set(secrets);
  if (unique.size !== secrets.length) {
    violations.push(`kind ${kind} declares duplicate secret keys`);
  }
  for (const field of fields) {
    if ((field.type === 'secret' || field.generated) && !unique.has(field.key)) {
      violations.push(`kind ${kind} secret field ${field.key} is not declared in secrets`);
    }
  }
}

function validateEgress(
  kind: string,
  policy: { hosts: readonly string[]; userHost?: { field: string } },
  fields: readonly { key: string }[],
  violations: string[],
): void {
  for (const host of policy.hosts) {
    if (!HOST_PATTERN.test(host)) {
      violations.push(`kind ${kind} has an invalid egress host ${host}`);
    }
  }
  if (policy.userHost && !fields.some((field) => field.key === policy.userHost?.field)) {
    violations.push(`kind ${kind} egress userHost field ${policy.userHost.field} does not exist`);
  }
}

function validateEndpoint(
  kind: string,
  endpoints: readonly string[],
  hasWebhook: boolean,
  violations: string[],
): void {
  if (endpoints.includes('webhookUrl') !== hasWebhook) {
    violations.push(`kind ${kind} endpoint webhookUrl must match the webhook handler`);
  }
}

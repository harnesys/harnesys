import type { HookBinding } from 'harnesys';
import type { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { VAULT_SECRET_PREFIX } from '../../domain/secret/vault-keys.ts';

export async function resolveHookSecrets(
  bindings: HookBinding[],
  secrets: SecretStorePort,
  orgId: string,
): Promise<HookBinding[]> {
  const out: HookBinding[] = [];
  for (const binding of bindings) {
    out.push(await resolveBinding(binding, secrets, orgId));
  }
  return out;
}

async function resolveBinding(
  binding: HookBinding,
  secrets: SecretStorePort,
  orgId: string,
): Promise<HookBinding> {
  const handler = binding.handler;
  if (handler.type !== 'command' || handler.env === undefined) {
    return binding;
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(handler.env)) {
    if (!value.startsWith(VAULT_SECRET_PREFIX)) {
      env[key] = value;
      continue;
    }
    const resolved = await secrets.get(orgId, value);
    if (resolved !== null && resolved !== '') {
      env[key] = resolved;
    }
  }
  return { ...binding, handler: { ...handler, env } };
}

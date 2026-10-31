import { Injectable } from '@harnesys/brix';
import {
  type IntegrationRecord,
  IntegrationRegistryPort,
} from '../../domain/integration/integration-registry.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import type { GoogleTokenSet } from '../../infra/integration/google/google-oauth-device.ts';
import { saveGoogleTokens } from '../../infra/integration/google/google-token-access.ts';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface FinalizeGoogleIntegrationInput {
  orgId: string;
  tokens: GoogleTokenSet;
}

export interface FinalizeGoogleIntegrationResult {
  integration: IntegrationRecord;
  credRef: string;
}

@Injectable()
export class FinalizeGoogleIntegrationUseCase {
  constructor(
    private readonly secrets: SecretStorePort,
    private readonly registry: IntegrationRegistryPort,
  ) {}

  async execute(input: FinalizeGoogleIntegrationInput): Promise<FinalizeGoogleIntegrationResult> {
    const credRef = crypto.randomUUID();
    await saveGoogleTokens(this.secrets, input.orgId, credRef, input.tokens);
    const grantedScopes = grantedScopesOf(input.tokens);
    const identity = await fetchGoogleAccountIdentity(input.tokens.accessToken, credRef);
    const now = new Date().toISOString();
    const existing = this.registry.findByExternalAccount(
      input.orgId,
      'google',
      identity.externalAccountId,
    );
    if (existing) {
      const updated = this.registry.update(input.orgId, existing.id, {
        status: 'connected',
        accountLabel: identity.accountLabel,
        credRef,
        providerJson: { ...(existing.providerJson ?? {}), grantedScopes },
        lastRefreshAt: now,
      });
      return { integration: updated, credRef };
    }
    const record: IntegrationRecord = {
      id: crypto.randomUUID(),
      orgId: input.orgId,
      provider: 'google',
      status: 'connected',
      accountLabel: identity.accountLabel,
      externalAccountId: identity.externalAccountId,
      credRef,
      providerJson: grantedScopes.length > 0 ? { grantedScopes } : null,
      createdAt: now,
      updatedAt: now,
      lastRefreshAt: now,
    };
    this.registry.insert(record);
    return { integration: record, credRef };
  }
}

interface GoogleAccountIdentity {
  externalAccountId: string;
  accountLabel: string;
}

function grantedScopesOf(tokens: GoogleTokenSet): string[] {
  return (tokens.scope ?? '').split(' ').filter((scope) => scope !== '');
}

async function fetchGoogleAccountIdentity(
  accessToken: string,
  credRef: string,
): Promise<GoogleAccountIdentity> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`userinfo failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.sub !== 'string' || !body.sub) {
      throw new Error('userinfo response has no sub');
    }
    return {
      externalAccountId: body.sub,
      accountLabel: typeof body.email === 'string' && body.email ? body.email : body.sub,
    };
  } catch {
    return { externalAccountId: credRef, accountLabel: 'Google account' };
  }
}

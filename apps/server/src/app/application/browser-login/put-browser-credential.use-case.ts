import { Injectable } from '@harnesys/brix';
import type { BrowserCredential, PutBrowserCredentialBody } from '@harnesys/contracts';
import { BrowserCredentialValidationException } from '../../domain/browser/browser-credential.error.ts';
import {
  BrowserCredentialRepositoryPort,
  type BrowserCredentialUpsert,
} from '../../domain/browser/credential-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { BROWSER_LOGIN_PREFIX } from '../../domain/secret/vault-keys.ts';

export interface PutBrowserCredentialInput {
  orgId: string;
  credentialId?: string;
  data: PutBrowserCredentialBody;
}

@Injectable()
export class PutBrowserCredentialUseCase {
  constructor(
    private readonly credentials: BrowserCredentialRepositoryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(input: PutBrowserCredentialInput): Promise<BrowserCredential> {
    const { orgId, data } = input;
    const existing = await this.credentials.list(orgId);
    const clash = existing.some(
      (record) => record.name === data.name && record.id !== input.credentialId,
    );
    if (clash) {
      throw new BrowserCredentialValidationException(
        `name "${data.name}" is already used by another website login`,
      );
    }
    const id = input.credentialId ?? crypto.randomUUID();
    const isCreate = !existing.some((record) => record.id === id);
    if (isCreate && data.password === undefined) {
      throw new BrowserCredentialValidationException(
        'password is required for a new website login',
      );
    }
    const upsert: BrowserCredentialUpsert = {
      name: data.name,
      loginUrl: data.loginUrl,
      username: data.username,
      usernameSelector: data.usernameSelector,
      passwordSelector: data.passwordSelector,
      submitSelector: data.submitSelector,
      successUrlPathPrefix: data.successUrlPathPrefix,
      successCookieName: data.successCookieName ?? null,
      successSelector: data.successSelector ?? null,
      challengeCodeSelector: data.challengeCodeSelector ?? null,
      challengeSubmitSelector: data.challengeSubmitSelector ?? null,
      egressHosts: Array.from(
        new Set([...data.egressHosts, new URL(data.loginUrl).hostname.toLowerCase()]),
      ),
    };
    if (data.password !== undefined) {
      await this.secrets.set(orgId, `${BROWSER_LOGIN_PREFIX}${id}`, data.password);
    }
    try {
      return await this.credentials.put(orgId, id, upsert);
    } catch (error) {
      if (isCreate) {
        await this.secrets.delete(orgId, `${BROWSER_LOGIN_PREFIX}${id}`).catch(() => {});
      }
      throw error;
    }
  }
}

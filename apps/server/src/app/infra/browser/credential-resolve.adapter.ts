import { Injectable } from '@harnesys/brix';
import type { BrowserCredential } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { BrowserCredentialRepositoryPort } from '../../domain/browser/credential-repository.port.ts';
import {
  type BrowserLoginGrantData,
  type CredentialListScope,
  type CredentialMaterial,
  CredentialResolvePort,
  type CredentialResolveScope,
  type CredentialStatus,
  type CredentialSummary,
} from '../../domain/browser/credential-resolve.port.ts';
import { isLockedOut } from '../../domain/browser/lockout.ts';
import { OrgAudit } from '../../domain/fleet/org-audit.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { BROWSER_LOGIN_PREFIX } from '../../domain/secret/vault-keys.ts';
import { packsFromConfig } from '../runtime/agent-definition.mapper.ts';
import {
  CredentialSocketChannel,
  type CredentialSocketRequest,
} from './credential-socket.channel.ts';
import { VaultPluginMaterializer } from './harnesys-vault-plugin.ts';

interface GrantTokenEntry {
  orgId: string;
  agentId: string;
  credentialId: string;
  expiresAt: number;
}

const TOKEN_TTL_MS = 5 * 60_000;

@Injectable()
export class LocalCredentialResolveAdapter extends CredentialResolvePort {
  private readonly tokens = new Map<string, GrantTokenEntry>();
  private channel: CredentialSocketChannel | null = null;

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly secrets: SecretStorePort,
    private readonly credentials: BrowserCredentialRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly audit: OrgAudit,
    private readonly plugin: VaultPluginMaterializer,
  ) {
    super();
  }

  async resolve(scope: CredentialResolveScope): Promise<BrowserLoginGrantData | null> {
    const denied = (reason: string): null => {
      this.appendAudit(scope.orgId, scope.credentialId, 'denied', `credential.resolve:${reason}`);
      return null;
    };
    const state = await this.status(scope);
    if (state !== 'ok') {
      return denied(state);
    }
    const record = await this.credentials.get(scope.orgId, scope.credentialId);
    if (!record) {
      return denied('not_found');
    }
    const socketPath = await this.channelOrThrow(scope.orgId);
    this.sweepTokens();
    const token = crypto.randomUUID();
    this.tokens.set(token, {
      orgId: scope.orgId,
      agentId: scope.agentId,
      credentialId: scope.credentialId,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    const command = this.plugin.materialize(token, socketPath);
    this.appendAudit(scope.orgId, scope.credentialId, 'ok', 'credential.resolve');
    return {
      credential: record,
      pluginEnv: {
        AGENT_BROWSER_PLUGINS: JSON.stringify([
          {
            name: 'harnesys',
            command,
            capabilities: ['credential.read'],
          },
        ]),
      },
    };
  }

  async get(scope: CredentialResolveScope): Promise<BrowserCredential | null> {
    const state = await this.status(scope);
    if (state !== 'ok') {
      this.appendAudit(scope.orgId, scope.credentialId, 'denied', `credential.get:${state}`);
      return null;
    }
    return await this.credentials.get(scope.orgId, scope.credentialId);
  }

  async status(scope: CredentialResolveScope): Promise<CredentialStatus> {
    const record = await this.credentials.get(scope.orgId, scope.credentialId);
    if (!record) {
      return 'missing';
    }
    if (isLockedOut(record, Date.now())) {
      return 'locked';
    }
    if (!this.granted(scope.orgId, scope.agentId, scope.credentialId)) {
      return 'not_granted';
    }
    return 'ok';
  }

  async listGranted(scope: CredentialListScope): Promise<CredentialSummary[]> {
    const records = await this.credentials.list(scope.orgId);
    return records
      .filter((record) => this.granted(scope.orgId, scope.agentId, record.id))
      .map((record) => ({
        id: record.id,
        name: record.name,
        loginUrl: record.loginUrl,
        status: isLockedOut(record, Date.now()) ? 'locked' : 'ok',
      }));
  }

  async resolveByToken(token: string, item: string): Promise<CredentialMaterial | null> {
    const entry = this.burnToken(token);
    this.plugin.remove(token);
    if (!entry || entry.credentialId !== item || entry.expiresAt <= Date.now()) {
      return null;
    }
    const state = await this.status(entry);
    if (state !== 'ok') {
      this.appendAudit(entry.orgId, entry.credentialId, 'denied', `credential.resolve:${state}`);
      return null;
    }
    const record = await this.credentials.get(entry.orgId, entry.credentialId);
    if (!record) {
      return null;
    }
    const password = await this.secrets.get(entry.orgId, `${BROWSER_LOGIN_PREFIX}${record.id}`);
    if (password === null) {
      return null;
    }
    return { username: record.username, password, url: record.loginUrl };
  }

  private burnToken(token: string): GrantTokenEntry | null {
    const entry = this.tokens.get(token);
    this.tokens.delete(token);
    return entry ?? null;
  }

  private sweepTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (entry.expiresAt <= now) {
        this.tokens.delete(token);
        this.plugin.remove(token);
      }
    }
  }

  private granted(orgId: string, agentId: string, credentialId: string): boolean {
    const agent = this.agents.findById(orgId, agentId);
    if (!agent) {
      return false;
    }
    const packs = packsFromConfig(agent.config);
    const web = packs.web;
    if (!web || web === true) {
      return false;
    }
    const spec = (web as Record<string, unknown>).spec;
    if (!spec || typeof spec !== 'object') {
      return false;
    }
    const refs = (spec as Record<string, unknown>).browserLoginRefs;
    if (!Array.isArray(refs)) {
      return false;
    }
    return refs.some((ref) => ref === credentialId);
  }

  private async channelOrThrow(orgId: string): Promise<string> {
    this.channel ??= new CredentialSocketChannel(this.layout, (request: CredentialSocketRequest) =>
      this.resolveByToken(request.token, request.item),
    );
    return this.channel.ensure(orgId);
  }

  private appendAudit(
    orgId: string,
    credentialId: string,
    result: 'ok' | 'denied',
    action: string,
  ): void {
    this.audit.append(orgId, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorKind: 'system',
      actorId: `browser-credential:${credentialId}`,
      viaNodeId: null,
      action: `browser.${action}`,
      resource: credentialId,
      result,
    });
  }
}

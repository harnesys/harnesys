import { describe, expect, mock, test } from 'bun:test';
import { HttpException, UnauthorizedException } from '@harnesys/brix';
import type { NodeStatus } from '@harnesys/contracts';
import {
  EventClaimPort,
  type EventClaimRecord,
  type GrantEventClaimInput,
} from '../../domain/fleet/event-claim.port.ts';
import {
  type InsertNodeInput,
  type NodeRecord,
  NodeRepository,
} from '../../domain/fleet/node-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import {
  type CreateSourceOperationGrantInput,
  SourceOperationGrantPort,
  type SourceOperationGrantRecord,
} from '../../domain/source/source-operation-grant.port.ts';
import { hashNodeToken } from './hash-node-token.ts';
import { ResolveFleetSecretsUseCase } from './resolve-fleet-secrets.use-case.ts';

class FakeGrants extends SourceOperationGrantPort {
  create(_input: CreateSourceOperationGrantInput): void {}
  consume(): SourceOperationGrantRecord | null {
    return null;
  }
}

class FakeNodeRepository extends NodeRepository {
  constructor(private readonly node: NodeRecord | null) {
    super();
  }

  insert(_orgId: string, _node: InsertNodeInput): void {}
  findById(): NodeRecord | null {
    return this.node;
  }
  findByName(): NodeRecord | null {
    return this.node;
  }
  findByTokenHash(_orgId: string, tokenHash: string): NodeRecord | null {
    if (!this.node || this.node.tokenHash !== tokenHash) {
      return null;
    }
    return this.node;
  }
  list(): NodeRecord[] {
    return this.node ? [this.node] : [];
  }
  updatePresence(): void {}
  setStatus(_orgId: string, _nodeId: string, _status: NodeStatus): void {}
  updateRoleAndToken(): void {}
  remove(): void {}
  readOrgName(): string | null {
    return null;
  }
  exportDbBytes(): Uint8Array {
    return new Uint8Array();
  }
  importDbBytes(): void {}
}

class FakeClaims extends EventClaimPort {
  constructor(private readonly claim: EventClaimRecord | null) {
    super();
  }
  grant(_input: GrantEventClaimInput): EventClaimRecord | null {
    return this.claim;
  }
  findByRun(): EventClaimRecord | null {
    return this.claim;
  }
  findActiveByNode(): EventClaimRecord[] {
    return this.claim ? [this.claim] : [];
  }
  countActiveByNode(): number {
    return this.claim ? 1 : 0;
  }
  renew(): boolean {
    return false;
  }
  markDone(): boolean {
    return false;
  }
  findExpired(): [] {
    return [];
  }

  releaseExpired(): number {
    return 0;
  }
}

class FakeSecrets extends SecretStorePort {
  constructor(private readonly store: Record<string, string>) {
    super();
  }
  get(_orgId: string, key: string): Promise<string | null> {
    return Promise.resolve(this.store[key] ?? null);
  }
  set(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  listKeys(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.store));
  }
}

const token = 'node-token';
const node: NodeRecord = {
  id: 'node-1',
  name: 'worker',
  role: 'worker',
  tokenHash: hashNodeToken(token),
  lastSeenAt: null,
  status: 'online',
  enrolledAt: new Date().toISOString(),
  diskFreeBytes: null,
  diskTotalBytes: null,
  dockerAvailable: null,
};

describe('ResolveFleetSecretsUseCase', () => {
  test('rejects authenticated resolve without active lease and never returns values', async () => {
    const get = mock((..._args: unknown[]) => Promise.resolve('secret-value'));
    const secrets = new (class extends FakeSecrets {
      override get(orgId: string, key: string): Promise<string | null> {
        return get(orgId, key) as Promise<string | null>;
      }
    })({ 'secret:API_KEY': 'secret-value' });
    const useCase = new ResolveFleetSecretsUseCase(
      new FakeNodeRepository(node),
      new FakeClaims(null),
      secrets,
      new FakeGrants(),
    );
    let caught: unknown;
    try {
      await useCase.execute({
        orgId: 'org-1',
        bearerToken: token,
        body: { runId: 'run-1', names: ['API_KEY', 'DB_URL'] },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpException);
    const err = caught as HttpException;
    expect(err.status).toBe(403);
    expect(err.errorCode).toBe('SECRETS_RESOLVE_FORBIDDEN');
    expect(JSON.stringify(err)).not.toContain('secret-value');
    expect(get).not.toHaveBeenCalled();
  });

  test('returns values from SecretStorePort when node owns active lease', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const useCase = new ResolveFleetSecretsUseCase(
      new FakeNodeRepository(node),
      new FakeClaims({
        runId: 'run-1',
        nodeId: 'node-1',
        leaseEpoch: 1,
        leaseUntil: future,
        token: 'claim',
        doneAt: null,
      }),
      new FakeSecrets({ 'secret:API_KEY': 'secret-value', 'secret:OTHER': 'x' }),
      new FakeGrants(),
    );
    const result = await useCase.execute({
      orgId: 'org-1',
      bearerToken: token,
      body: { runId: 'run-1', names: ['API_KEY'] },
    });
    expect(result.values).toEqual({ API_KEY: 'secret-value' });
  });

  test('rejects missing node token', async () => {
    const useCase = new ResolveFleetSecretsUseCase(
      new FakeNodeRepository(null),
      new FakeClaims(null),
      new FakeSecrets({}),
      new FakeGrants(),
    );
    await expect(
      useCase.execute({
        orgId: 'org-1',
        bearerToken: '',
        body: { runId: 'run-1', names: ['API_KEY'] },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

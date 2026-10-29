import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, ValidationException } from '@harnesys/brix';
import type {
  PromoteAcceptResponse,
  PromoteCompleteBody,
  PromoteCompleteResponse,
  PromoteIdentitySliceResponse,
  PromoteStartResponse,
} from '@harnesys/contracts';
import { PromoteIdentitySliceResponseSchema } from '@harnesys/contracts';
import {
  NodeNotFoundException,
  NotRelayOrgException,
  NotWorkerOrgException,
  PromoteInvalidException,
} from '../../domain/fleet/fleet.error.ts';
import { NodeIdentityStore } from '../../domain/fleet/node-identity-store.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { PromoteSessionStore } from '../../domain/fleet/promote-session.port.ts';
import type { MembershipRecord } from '../../domain/identity/membership-repository.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { SessionStore } from '../../domain/identity/session-store.port.ts';
import { TicketKeyStore } from '../../domain/identity/ticket-key-store.port.ts';
import { type UserRecord, UserRepository } from '../../domain/identity/user-repository.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgDataPackPort } from '../../domain/machine/org-data-pack.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNotFoundException } from '../../domain/org/org.error.ts';
import { hashNodeToken } from '../fleet/hash-node-token.ts';

const PROMOTE_TTL_MS = 15 * 60_000;

export function shouldImportDataArchive(status: number): boolean {
  return status === 200;
}

export interface PromoteStartInput {
  orgId: string;
  targetNodeId: string;
  newRelayUrl: string;
}

export interface PromoteAcceptInput {
  orgId: string;
  sourceRelayUrl: string;
  promoteToken: string;
}

export interface IdentitySlice {
  users: UserRecord[];
  memberships: MembershipRecord[];
}

@Injectable()
export class PromoteRelayUseCase {
  constructor(
    private readonly sessions: PromoteSessionStore,
    private readonly nodes: NodeRepository,
    private readonly identities: NodeIdentityStore,
    private readonly store: OrgMachineStore,
    private readonly machineConfig: MachineConfigPort,
    private readonly dataPack: OrgDataPackPort,
    private readonly users: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly identitySessions: SessionStore,
    private readonly keys: TicketKeyStore,
  ) {}

  start(input: PromoteStartInput): PromoteStartResponse {
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (entry.role !== 'relay') {
      throw new NotRelayOrgException(input.orgId);
    }
    const newRelayUrl = input.newRelayUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(newRelayUrl)) {
      throw new ValidationException('newRelayUrl must start with http:// or https://');
    }
    const target = this.nodes.findById(input.orgId, input.targetNodeId);
    if (target?.role !== 'worker') {
      throw new NodeNotFoundException(input.targetNodeId);
    }
    const host = this.machineConfig.get();
    const sourceToken = randomBytes(32).toString('base64url');
    const sourceNodeId = host.id;
    const existing = this.nodes.findById(input.orgId, sourceNodeId);
    if (!existing) {
      this.nodes.insert(input.orgId, {
        id: sourceNodeId,
        name: host.name,
        role: 'worker',
        tokenHash: hashNodeToken(sourceToken),
        enrolledAt: new Date().toISOString(),
        status: 'offline',
      });
    } else {
      this.nodes.updateRoleAndToken(input.orgId, sourceNodeId, {
        role: 'worker',
        tokenHash: hashNodeToken(sourceToken),
      });
    }
    this.nodes.updateRoleAndToken(input.orgId, input.targetNodeId, {
      role: 'relay',
      tokenHash: null,
    });
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + PROMOTE_TTL_MS).toISOString();
    this.sessions.create({
      token,
      orgId: input.orgId,
      targetNodeId: input.targetNodeId,
      newRelayUrl,
      sourceNodeId,
      sourceNodeName: host.name,
      sourceToken,
      expiresAt,
    });
    return {
      promoteToken: token,
      orgId: input.orgId,
      expiresAt,
      newRelayUrl,
    };
  }

  exportDb(promoteToken: string): { orgId: string; bytes: Uint8Array } {
    const session = this.sessions.get(promoteToken);
    if (!session) {
      throw new PromoteInvalidException();
    }
    return { orgId: session.orgId, bytes: this.nodes.exportDbBytes(session.orgId) };
  }

  async exportData(promoteToken: string): Promise<{ orgId: string; archivePath: string } | null> {
    const session = this.sessions.get(promoteToken);
    if (!session) {
      throw new PromoteInvalidException();
    }
    const dir = mkdtempSync(join(tmpdir(), 'harnesys-promote-'));
    const archivePath = join(dir, 'org-data.tgz');
    const packed = await this.dataPack.pack(session.orgId, archivePath);
    if (!packed) {
      rmSync(dir, { recursive: true, force: true });
      return null;
    }
    return { orgId: session.orgId, archivePath };
  }

  exportIdentitySlice(orgId: string): IdentitySlice {
    const memberships = this.memberships.listByOrg(orgId);
    const users: UserRecord[] = [];
    for (const membership of memberships) {
      if (users.some((user) => user.id === membership.userId)) {
        continue;
      }
      const user = this.users.findById(membership.userId);
      if (user) {
        users.push(user);
      }
    }
    return { users, memberships };
  }

  importIdentitySlice(slice: IdentitySlice): void {
    for (const user of slice.users) {
      this.users.upsertSync(user);
      this.identitySessions.revokeUserFamilies(user.id, new Date().toISOString(), 'promote');
    }
    for (const membership of slice.memberships) {
      this.memberships.upsertSync(membership);
    }
  }

  exportIdentitySliceForPromote(token: string): PromoteIdentitySliceResponse {
    const session = this.sessions.get(token);
    if (!session) {
      throw new PromoteInvalidException();
    }
    const slice = this.exportIdentitySlice(session.orgId);
    return { users: slice.users, memberships: slice.memberships };
  }

  private async importIdentitySliceTransfer(
    sourceRelayUrl: string,
    promoteToken: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(
        `${sourceRelayUrl}/api/fleet/promote/${encodeURIComponent(promoteToken)}/identity-slice`,
        { method: 'GET', signal: AbortSignal.timeout(60_000) },
      );
    } catch {
      throw new ValidationException('identity slice transfer failed: source relay not reachable');
    }
    if (!response.ok) {
      throw new PromoteInvalidException();
    }
    const slice = PromoteIdentitySliceResponseSchema.parse(await response.json());
    this.importIdentitySlice(slice);
  }

  private async importDataArchive(
    orgId: string,
    sourceRelayUrl: string,
    promoteToken: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(
        `${sourceRelayUrl}/api/fleet/promote/${encodeURIComponent(promoteToken)}/org-data.tgz`,
        { method: 'GET', signal: AbortSignal.timeout(300_000) },
      );
    } catch {
      return;
    }
    if (!shouldImportDataArchive(response.status)) {
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const dir = mkdtempSync(join(tmpdir(), 'harnesys-promote-'));
    const archivePath = join(dir, 'org-data.tgz');
    try {
      writeFileSync(archivePath, bytes);
      await this.dataPack.unpack(orgId, archivePath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async accept(input: PromoteAcceptInput): Promise<PromoteAcceptResponse> {
    const sourceRelayUrl = input.sourceRelayUrl.trim().replace(/\/+$/, '');
    const entry = this.store.get(input.orgId);
    if (!entry) {
      throw new OrgNotFoundException(input.orgId);
    }
    if (entry.role !== 'worker') {
      throw new NotWorkerOrgException(input.orgId);
    }
    let dbResponse: Response;
    try {
      dbResponse = await fetch(
        `${sourceRelayUrl}/api/fleet/promote/${encodeURIComponent(input.promoteToken)}/org.db`,
        { method: 'GET', signal: AbortSignal.timeout(60_000) },
      );
    } catch {
      throw new ValidationException(`source relay not reachable at ${sourceRelayUrl}`);
    }
    if (!dbResponse.ok) {
      throw new PromoteInvalidException();
    }
    const bytes = new Uint8Array(await dbResponse.arrayBuffer());
    this.nodes.importDbBytes(input.orgId, bytes);
    await this.importIdentitySliceTransfer(sourceRelayUrl, input.promoteToken);
    await this.importDataArchive(input.orgId, sourceRelayUrl, input.promoteToken);
    const ticketKey = this.keys.rotate(input.orgId);
    const orgName = this.nodes.readOrgName(input.orgId) ?? entry.name;
    this.identities.remove(input.orgId);
    this.store.upsert({
      orgId: input.orgId,
      name: orgName,
      description: entry.description ?? '',
      role: 'relay',
      relayUrl: null,
    });
    let completeResponse: Response;
    try {
      completeResponse = await fetch(`${sourceRelayUrl}/api/fleet/promote/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoteToken: input.promoteToken, ticketKey }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ValidationException('promote complete callback failed');
    }
    if (!completeResponse.ok) {
      throw new ValidationException(`promote complete failed: HTTP ${completeResponse.status}`);
    }
    return { ok: true, orgId: input.orgId, role: 'relay' };
  }

  complete(body: PromoteCompleteBody): PromoteCompleteResponse {
    const session = this.sessions.consume(body.promoteToken);
    if (!session) {
      throw new PromoteInvalidException();
    }
    const entry = this.store.get(session.orgId);
    if (!entry) {
      throw new OrgNotFoundException(session.orgId);
    }
    if (typeof body.ticketKey !== 'string' || !body.ticketKey) {
      throw new ValidationException('ticketKey is required to complete promote');
    }
    this.revokeOrgSessionFamilies(session.orgId);
    this.identities.write({
      orgId: session.orgId,
      nodeId: session.sourceNodeId,
      nodeName: session.sourceNodeName,
      role: 'worker',
      relayUrl: session.newRelayUrl,
      token: session.sourceToken,
      ticketKey: body.ticketKey,
    });
    this.store.upsert({
      orgId: session.orgId,
      name: entry.name,
      description: entry.description ?? '',
      role: 'worker',
      relayUrl: session.newRelayUrl,
    });
    return {
      ok: true,
      orgId: session.orgId,
      role: 'worker',
      relayUrl: session.newRelayUrl,
    };
  }

  private revokeOrgSessionFamilies(orgId: string): void {
    for (const membership of this.memberships.listByOrg(orgId)) {
      this.identitySessions.revokeUserFamilies(
        membership.userId,
        new Date().toISOString(),
        'promote',
      );
    }
  }
}

import type { RunEnvironment, RunEnvironmentAnchor } from '@harnesys/contracts';
import type { PendingSessionEvent } from 'harnesys';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { LOCAL_EXECUTION_PROFILE_ID } from '../../domain/execution-profile/execution-profile.ts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import {
  DEFAULT_WORKSPACE_IMAGE,
  decidePlacement,
  formatPlacementSummary,
  type PlacementEvalNode,
  type PlacementLabels,
  type PlacementResult,
} from '../../domain/fleet/placement.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { resolveEffectiveProfile } from '../execution-profile/resolve-effective-profile.ts';

export interface RequiredSource {
  sourceId: string;
  access: 'read' | 'write';
}

export interface ResolveRunPlacementInput {
  orgId: string;
  runId: string;
  threadProfileId?: string | null;
  agentProfileId: string | null;
  issueRuleProfileId?: string | null;
  environment?: RunEnvironment | null;
  worktreeHostId?: string | null;
  profiles: ExecutionProfilePort;
  hub: FleetHubPort;
  claims: EventClaimPort;
  worktrees?: RepositoryWorktreePort;
  materializations?: SourceMaterializationPort;
}

export function resolveRunPlacement(input: ResolveRunPlacementInput): PlacementResult {
  const orgDefaultProfileId = input.profiles.getDefault(input.orgId) ?? LOCAL_EXECUTION_PROFILE_ID;
  const effective = resolveEffectiveProfile({
    threadProfileId: input.threadProfileId,
    issueRuleProfileId: input.issueRuleProfileId,
    agentProfileId: input.agentProfileId,
    orgDefaultProfileId,
  });
  const profile = input.profiles.findById(input.orgId, effective.profileId);
  if (!profile) {
    throw new ThreadValidationException(`execution profile not found: ${effective.profileId}`);
  }
  const isolation = isolationOf(profile);
  const nowIso = new Date().toISOString();
  const presence = input.hub.listPresence(input.orgId);
  const presenceById = new Map(presence.map((node) => [node.id, node]));
  const profileNodeIds = new Set(profile.nodeIds);
  const nodeIds = new Set<string>([...profile.nodeIds, ...presence.map((node) => node.id)]);
  const anchor = input.environment?.anchor ?? null;
  const pinnedHostId = pinnedHostIdOf(input, anchor);
  const requiredSources = requiredSourcesOf(anchor);
  const readyHosts = readyHostsOf(input, requiredSources);
  const nodes: PlacementEvalNode[] = [...nodeIds].map((nodeId) => {
    const present = presenceById.get(nodeId);
    const inProfile = profileNodeIds.has(nodeId);
    const affinityOk = !pinnedHostId || nodeId === pinnedHostId;
    return {
      nodeId,
      status: present?.status ?? 'offline',
      inProfile: inProfile && affinityOk,
      activeClaims: input.claims.countActiveByNode(input.orgId, nodeId, nowIso),
      sourcesReady: readyHosts === null || readyHosts.has(nodeId),
      features: { dockerAvailable: present?.dockerAvailable ?? null },
    };
  });
  const labels: PlacementLabels = {
    profileName: profile.name,
    nodeNames: Object.fromEntries(
      [...nodeIds].map((nodeId) => {
        const present = presenceById.get(nodeId);
        return [nodeId, present?.name ?? nodeId];
      }),
    ),
  };
  return decidePlacement({
    request: {
      runId: input.runId,
      profileId: effective.profileId,
      profileSource: effective.selectedBy,
      requiredSources,
      ...(isolation ? { isolation } : {}),
    },
    nodes,
    sourceConstraints: sourceConstraints(pinnedHostId),
    labels,
  });
}

export function toPlacementEvent(
  decision: PlacementResult,
  extras?: { worktreeId?: string; worktreeHostId?: string },
): PendingSessionEvent {
  return {
    type: 'placement.decided',
    profileId: decision.request.profileId,
    profileSource: decision.request.profileSource,
    ...(decision.kind === 'selected' ? { selectedNodeId: decision.nodeId } : {}),
    ...(decision.kind === 'unavailable' ? { unavailableReason: decision.reason } : {}),
    ...(extras?.worktreeId ? { worktreeId: extras.worktreeId } : {}),
    ...(extras?.worktreeHostId ? { worktreeHostId: extras.worktreeHostId } : {}),
    requiredSources: decision.request.requiredSources,
    candidates: decision.candidates.map((candidate) => ({
      nodeId: candidate.nodeId,
      eligible: candidate.eligible,
      reasons: [...candidate.reasons],
      activeClaims: candidate.activeClaims,
    })),
    summary: formatPlacementSummary(decision),
  };
}

function isolationOf(profile: { isolation: 'host' | 'container'; dockerImage: string | null }) {
  return profile.isolation === 'container'
    ? { mode: 'container' as const, image: profile.dockerImage ?? DEFAULT_WORKSPACE_IMAGE }
    : undefined;
}

function pinnedHostIdOf(
  input: ResolveRunPlacementInput,
  anchor: RunEnvironmentAnchor | null,
): string | null {
  if (input.environment === undefined && anchor === null) {
    return input.worktreeHostId ?? null;
  }
  if (anchor === null) {
    return null;
  }
  if (anchor.kind === 'folder') {
    return anchor.hostId ?? null;
  }
  if (anchor.worktreeId === undefined) {
    return null;
  }
  const worktree = input.worktrees?.findById(input.orgId, anchor.worktreeId);
  return worktree?.hostId ?? input.worktreeHostId ?? null;
}

function requiredSourcesOf(anchor: RunEnvironmentAnchor | null): RequiredSource[] {
  if (anchor?.kind !== 'source' || anchor.worktreeId !== undefined) {
    return [];
  }
  return [{ sourceId: anchor.sourceId, access: 'write' }];
}

function readyHostsOf(
  input: ResolveRunPlacementInput,
  requiredSources: RequiredSource[],
): Set<string> | null {
  const sourceId = requiredSources[0]?.sourceId;
  if (sourceId === undefined || input.materializations === undefined) {
    return null;
  }
  const hosts = input.materializations
    .listForSource(input.orgId, sourceId)
    .filter((record) => record.state === 'ready')
    .map((record) => record.hostId);
  return new Set(hosts);
}

function sourceConstraints(hostId: string | null) {
  if (!hostId) {
    return [];
  }
  return [
    {
      sourceId: '__worktree_affinity__' as const,
      distributionKind: 'host-bound',
      hostId,
    },
  ];
}

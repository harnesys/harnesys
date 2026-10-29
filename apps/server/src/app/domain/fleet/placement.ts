export const DEFAULT_WORKSPACE_IMAGE = 'node:22-bookworm';

export type PlacementProfileSource = 'thread' | 'agent' | 'organization' | 'issue-rule';

export type RunIsolation = { mode: 'container'; image: string } | { mode: 'host' };

export type PlacementCandidateReason =
  | 'not-in-profile'
  | 'offline'
  | 'draining'
  | 'source-not-ready'
  | 'docker_missing';

export interface PlacementRequest {
  runId: string;
  profileId: string;
  profileSource: PlacementProfileSource;
  requiredSources: Array<{ sourceId: string; access: 'read' | 'write' }>;
  isolation?: RunIsolation;
}

export interface PlacementCandidate {
  nodeId: string;
  eligible: boolean;
  reasons: PlacementCandidateReason[];
  activeClaims: number;
}

export interface PlacementLabels {
  profileName?: string;
  nodeNames?: Record<string, string>;
  sourceNames?: Record<string, string>;
}

export type PlacementResult =
  | {
      kind: 'selected';
      nodeId: string;
      request: PlacementRequest;
      candidates: PlacementCandidate[];
      labels?: PlacementLabels;
    }
  | {
      kind: 'unavailable';
      request: PlacementRequest;
      candidates: PlacementCandidate[];
      reason: string;
      labels?: PlacementLabels;
    };

export interface PlacementEvalNode {
  nodeId: string;
  status: string;
  inProfile: boolean;
  activeClaims: number;
  sourcesReady: boolean;
  features?: { dockerAvailable?: boolean | null };
}

export interface PlacementSourceConstraint {
  sourceId: string;
  distributionKind: string;
  hostId: string | null;
}

export interface DecidePlacementInput {
  request: PlacementRequest;
  nodes: PlacementEvalNode[];
  sourceConstraints?: PlacementSourceConstraint[];
  labels?: PlacementLabels;
}

export function decidePlacement(input: DecidePlacementInput): PlacementResult {
  const candidates = input.nodes.map((node) => evaluateCandidate(node, input.request));
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const labels = input.labels;
  if (eligible.length === 0) {
    return {
      kind: 'unavailable',
      request: input.request,
      candidates,
      reason: explainUnavailable(input.request, candidates, input.sourceConstraints ?? [], labels),
      ...(labels ? { labels } : {}),
    };
  }
  const ranked = [...eligible].sort(
    (a, b) => a.activeClaims - b.activeClaims || (a.nodeId < b.nodeId ? -1 : 1),
  );
  const picked = ranked[0];
  if (!picked) {
    return {
      kind: 'unavailable',
      request: input.request,
      candidates,
      reason: explainUnavailable(input.request, candidates, input.sourceConstraints ?? [], labels),
      ...(labels ? { labels } : {}),
    };
  }
  return {
    kind: 'selected',
    nodeId: picked.nodeId,
    request: input.request,
    candidates,
    ...(labels ? { labels } : {}),
  };
}

export function formatPlacementSummary(
  result: PlacementResult,
  labels: PlacementLabels | undefined = result.labels,
): string {
  const profile = `profile ${labelProfile(result.request.profileId, labels)} (${result.request.profileSource})`;
  const excluded = result.candidates
    .filter((candidate) => !candidate.eligible)
    .map(
      (candidate) =>
        `${labelNode(candidate.nodeId, labels)} (${candidate.reasons.join(', ') || 'ineligible'})`,
    );
  const excludedLine = excluded.length > 0 ? ` Excluded: ${excluded.join('; ')}.` : '';
  if (result.kind === 'selected') {
    return `Placement: ${profile} → node ${labelNode(result.nodeId, labels)}.${excludedLine}`.trim();
  }
  return `Placement unavailable: ${profile} — ${result.reason}.${excludedLine}`.trim();
}

function evaluateCandidate(node: PlacementEvalNode, request: PlacementRequest): PlacementCandidate {
  const reasons: PlacementCandidateReason[] = [];
  if (!node.inProfile) {
    reasons.push('not-in-profile');
  }
  if (node.status === 'offline') {
    reasons.push('offline');
  } else if (node.status === 'draining') {
    reasons.push('draining');
  } else if (node.status !== 'online') {
    reasons.push('offline');
  }
  if (!node.sourcesReady) {
    reasons.push('source-not-ready');
  }
  if (request.isolation?.mode === 'container' && node.features?.dockerAvailable !== true) {
    reasons.push('docker_missing');
  }
  return {
    nodeId: node.nodeId,
    eligible: reasons.length === 0,
    reasons,
    activeClaims: node.activeClaims,
  };
}

function explainUnavailable(
  request: PlacementRequest,
  candidates: PlacementCandidate[],
  constraints: PlacementSourceConstraint[],
  labels?: PlacementLabels,
): string {
  const profileHosts = new Set(
    candidates
      .filter((candidate) => !candidate.reasons.includes('not-in-profile'))
      .map((c) => c.nodeId),
  );
  const hostBoundOutside = constraints.filter(
    (source) =>
      source.distributionKind === 'host-bound' && source.hostId && !profileHosts.has(source.hostId),
  );
  if (hostBoundOutside.length > 0) {
    const parts = hostBoundOutside.map((source) => {
      const sourceLabel = labelSource(source.sourceId, labels);
      const hostLabel = source.hostId ? labelNode(source.hostId, labels) : 'unknown host';
      return `${sourceLabel} on ${hostLabel}`;
    });
    return (
      `host-bound ${parts.join('; ')} is outside profile ${labelProfile(request.profileId, labels)}. ` +
      `Attach a source on a profile node, add the required host to the profile, or switch the agent profile`
    );
  }
  if (candidates.every((candidate) => candidate.reasons.includes('not-in-profile'))) {
    return `profile ${labelProfile(request.profileId, labels)} has no member nodes`;
  }
  if (
    candidates.some((candidate) => candidate.reasons.includes('source-not-ready')) &&
    candidates
      .filter((candidate) => !candidate.reasons.includes('not-in-profile'))
      .every(
        (candidate) =>
          candidate.reasons.includes('source-not-ready') ||
          candidate.reasons.includes('offline') ||
          candidate.reasons.includes('draining'),
      )
  ) {
    return `no profile node has required sources ready`;
  }
  return `no eligible online nodes in profile ${labelProfile(request.profileId, labels)}`;
}

function labelProfile(profileId: string, labels?: PlacementLabels): string {
  const name = labels?.profileName?.trim();
  return name && name !== profileId ? `${name} (${profileId})` : profileId;
}

function labelNode(nodeId: string, labels?: PlacementLabels): string {
  const name = labels?.nodeNames?.[nodeId]?.trim();
  return name && name !== nodeId ? `${name} (${nodeId})` : nodeId;
}

function labelSource(sourceId: string, labels?: PlacementLabels): string {
  const name = labels?.sourceNames?.[sourceId]?.trim();
  return name && name !== sourceId ? `source "${name}"` : `source ${sourceId}`;
}

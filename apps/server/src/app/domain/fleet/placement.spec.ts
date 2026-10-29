import { describe, expect, test } from 'bun:test';
import { DEFAULT_WORKSPACE_IMAGE, decidePlacement, formatPlacementSummary } from './placement.ts';

const baseRequest = {
  runId: 'run-1',
  profileId: 'profile-a',
  profileSource: 'agent' as const,
  requiredSources: [{ sourceId: 'src-git', access: 'read' as const }],
};

describe('decidePlacement', () => {
  test('selects least-loaded ready profile node', () => {
    const result = decidePlacement({
      request: baseRequest,
      nodes: [
        {
          nodeId: 'worker-a',
          status: 'online',
          inProfile: true,
          activeClaims: 2,
          sourcesReady: true,
        },
        {
          nodeId: 'worker-b',
          status: 'online',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: true,
        },
        {
          nodeId: 'worker-c',
          status: 'online',
          inProfile: false,
          activeClaims: 0,
          sourcesReady: true,
        },
      ],
    });
    expect(result.kind).toBe('selected');
    if (result.kind !== 'selected') {
      return;
    }
    expect(result.nodeId).toBe('worker-b');
    expect(result.candidates.find((item) => item.nodeId === 'worker-c')?.reasons).toContain(
      'not-in-profile',
    );
  });

  test('returns unavailable when profile pool is offline', () => {
    const result = decidePlacement({
      request: baseRequest,
      nodes: [
        {
          nodeId: 'worker-a',
          status: 'offline',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: true,
        },
        {
          nodeId: 'worker-b',
          status: 'draining',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: true,
        },
      ],
    });
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') {
      return;
    }
    expect(result.reason).toContain('no eligible online nodes');
    expect(result.candidates.every((item) => !item.eligible)).toBe(true);
  });

  test('explains host-bound mismatch outside profile', () => {
    const result = decidePlacement({
      request: {
        ...baseRequest,
        requiredSources: [{ sourceId: 'src-local', access: 'write' }],
      },
      sourceConstraints: [
        { sourceId: 'src-local', distributionKind: 'host-bound', hostId: 'host-bound-1' },
      ],
      nodes: [
        {
          nodeId: 'worker-a',
          status: 'online',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: false,
        },
        {
          nodeId: 'host-bound-1',
          status: 'online',
          inProfile: false,
          activeClaims: 0,
          sourcesReady: true,
        },
      ],
    });
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') {
      return;
    }
    expect(result.reason).toContain('host-bound');
    expect(result.reason).toContain('host-bound-1');
    expect(result.reason).toContain('outside profile');
    expect(result.candidates.find((item) => item.nodeId === 'worker-a')?.reasons).toContain(
      'source-not-ready',
    );
  });

  test('formatPlacementSummary includes profile source and exclusions', () => {
    const result = decidePlacement({
      request: baseRequest,
      nodes: [
        {
          nodeId: 'worker-a',
          status: 'online',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: true,
        },
        {
          nodeId: 'worker-b',
          status: 'offline',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: false,
        },
      ],
    });
    const summary = formatPlacementSummary(result);
    expect(summary).toContain('profile profile-a (agent)');
    expect(summary).toContain('worker-a');
    expect(summary).toContain('worker-b (offline, source-not-ready)');
  });

  test('labels replace ids in unavailable host-bound reason', () => {
    const result = decidePlacement({
      request: {
        ...baseRequest,
        profileId: 'profile-mac',
        requiredSources: [{ sourceId: 'src-workspace', access: 'write' }],
      },
      sourceConstraints: [
        {
          sourceId: 'src-workspace',
          distributionKind: 'host-bound',
          hostId: 'host-vps',
        },
      ],
      nodes: [
        {
          nodeId: 'host-mac',
          status: 'online',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: false,
        },
        {
          nodeId: 'host-vps',
          status: 'online',
          inProfile: false,
          activeClaims: 0,
          sourcesReady: true,
        },
      ],
      labels: {
        profileName: 'MacBook',
        nodeNames: { 'host-vps': '712d900c25aa', 'host-mac': 'MacBook' },
        sourceNames: { 'src-workspace': 'Workspace' },
      },
    });
    expect(result.kind).toBe('unavailable');
    if (result.kind !== 'unavailable') {
      return;
    }
    expect(result.reason).toContain('source "Workspace"');
    expect(result.reason).toContain('712d900c25aa (host-vps)');
    expect(result.reason).toContain('MacBook (profile-mac)');
    const summary = formatPlacementSummary(result, {
      profileName: 'MacBook',
      nodeNames: { 'host-vps': '712d900c25aa', 'host-mac': 'MacBook' },
    });
    expect(summary).toContain('MacBook (host-mac) (source-not-ready)');
  });

  test('container isolation excludes node without docker', () => {
    const result = decidePlacement({
      request: {
        runId: 'r1',
        profileId: 'p1',
        profileSource: 'agent',
        requiredSources: [],
        isolation: { mode: 'container', image: DEFAULT_WORKSPACE_IMAGE },
      },
      nodes: [
        {
          nodeId: 'n1',
          status: 'online',
          inProfile: true,
          activeClaims: 0,
          sourcesReady: true,
          features: { dockerAvailable: false },
        },
      ],
      sourceConstraints: [],
      labels: { profileName: 'P', nodeNames: {}, sourceNames: {} },
    });
    expect(result.kind).toBe('unavailable');
    expect(result.candidates[0]?.reasons).toContain('docker_missing');
  });
});

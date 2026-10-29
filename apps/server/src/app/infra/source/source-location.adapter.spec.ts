import { describe, expect, test } from 'bun:test';
import type { MaterializationRecord } from '../../domain/source/source-materialization.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { resolveSourceLocation } from './source-location.adapter.ts';

function hostBoundSource(hostId: string): SourceRecord {
  return {
    id: 'source-1',
    orgId: 'org-1',
    name: 'Test',
    description: null,
    distribution: { kind: 'host-bound', hostId },
    uiVisibility: 'org',
    managed: false,
    vcs: null,
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function gitVcsSource(): SourceRecord {
  return {
    id: 'source-1',
    orgId: 'org-1',
    name: 'Repo',
    description: null,
    distribution: { kind: 'host-bound', hostId: 'host-a' },
    uiVisibility: 'org',
    managed: false,
    vcs: {
      engine: 'git',
      remoteUrl: 'https://example.com/repo.git',
      credRef: null,
      defaultBranch: 'main',
    },
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function materialization(
  partial: Partial<MaterializationRecord> & Pick<MaterializationRecord, 'state' | 'origin'>,
): MaterializationRecord {
  return {
    orgId: 'org-1',
    sourceId: 'source-1',
    hostId: 'host-a',
    localPath: null,
    lastError: null,
    revision: 1,
    updatedAt: new Date().toISOString(),
    lastConflictPaths: [],
    refreshRequired: false,
    ...partial,
  };
}

describe('resolveSourceLocation', () => {
  test('resolves attached ready materialization', () => {
    const result = resolveSourceLocation(
      {
        findSource: () => hostBoundSource('host-a'),
        findMaterialization: () =>
          materialization({
            state: 'ready',
            origin: 'attached',
            localPath: '/data/source',
          }),
        managedRoot: () => '/managed/source-1',
      },
      { orgId: 'org-1', sourceId: 'source-1', hostId: 'host-a' },
      (path) => path,
    );
    expect(result).toEqual({
      sourceId: 'source-1',
      hostId: 'host-a',
      absoluteRoot: '/data/source',
    });
  });

  test('throws SOURCE_HOST_MISMATCH for host-bound on other host', () => {
    expect(() =>
      resolveSourceLocation(
        {
          findSource: () => hostBoundSource('host-a'),
          findMaterialization: () => null,
          managedRoot: () => '/managed/source-1',
        },
        { orgId: 'org-1', sourceId: 'source-1', hostId: 'host-b' },
        (path) => path,
      ),
    ).toThrow(/bound to host/);
  });

  test('throws SOURCE_MATERIALIZATION_ABSENT when materialization missing', () => {
    expect(() =>
      resolveSourceLocation(
        {
          findSource: () => gitVcsSource(),
          findMaterialization: () => null,
          managedRoot: () => '/managed/source-1',
        },
        { orgId: 'org-1', sourceId: 'source-1', hostId: 'host-a' },
        (path) => path,
      ),
    ).toThrow(/no materialization/);
  });

  test('resolves ready attached mat when source registry miss (worker replica gap)', () => {
    const result = resolveSourceLocation(
      {
        findSource: () => null,
        findMaterialization: () =>
          materialization({
            state: 'ready',
            origin: 'attached',
            localPath: '/Users/me/ws',
          }),
        managedRoot: () => '/managed/source-1',
      },
      { orgId: 'org-1', sourceId: 'source-1', hostId: 'host-a' },
      (path) => path,
    );
    expect(result.absoluteRoot).toBe('/Users/me/ws');
  });

  test('throws SOURCE_MATERIALIZATION_FAILED when state is failed', () => {
    expect(() =>
      resolveSourceLocation(
        {
          findSource: () => gitVcsSource(),
          findMaterialization: () =>
            materialization({
              state: 'failed',
              origin: 'managed',
              lastError: 'clone failed',
            }),
          managedRoot: () => '/managed/source-1',
        },
        { orgId: 'org-1', sourceId: 'source-1', hostId: 'host-a' },
        (path) => path,
      ),
    ).toThrow(/materialization failed/);
  });

  test('uses managed layout path when ready without localPath', () => {
    const result = resolveSourceLocation(
      {
        findSource: () => hostBoundSource('host-a'),
        findMaterialization: () =>
          materialization({
            state: 'ready',
            origin: 'managed',
            localPath: null,
          }),
        managedRoot: () => '/managed/source-1',
      },
      { orgId: 'org-1', sourceId: 'source-1', hostId: 'host-a' },
      (path) => path,
    );
    expect(result.absoluteRoot).toBe('/managed/source-1');
  });
});

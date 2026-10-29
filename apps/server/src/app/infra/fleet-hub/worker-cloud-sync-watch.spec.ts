import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { OrgExecutionReplicaPort } from '../../domain/fleet/org-execution-replica.port.ts';
import { WorkerCloudSyncWatch } from './worker-cloud-sync-watch.ts';

describe('WorkerCloudSyncWatch DI metadata', () => {
  test('retains the replica port token in constructor metadata', () => {
    const paramtypes = Reflect.getMetadata('design:paramtypes', WorkerCloudSyncWatch);

    expect(paramtypes?.[0]).toBe(OrgExecutionReplicaPort);
  });
});

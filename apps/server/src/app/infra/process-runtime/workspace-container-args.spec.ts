import { describe, expect, test } from 'bun:test';
import { containerNameOf, workspaceRunArgs } from './workspace-container-args.ts';

describe('workspace-container-args', () => {
  test('containerNameOf is deterministic and prefixed with harness-ws-', () => {
    const first = containerNameOf('org-1', 'acme/main');
    const second = containerNameOf('org-1', 'acme/main');
    expect(first).toBe(second);
    expect(first.startsWith('harness-ws-')).toBe(true);
    expect(containerNameOf('org-2', 'acme/main')).not.toBe(first);
  });

  test('workspaceRunArgs carries user, labels, mounts and sleep infinity tail', () => {
    const args = workspaceRunArgs({
      name: 'harness-ws-x',
      image: 'node:22-bookworm',
      mounts: ['/srv/a', '/srv/b'],
      orgId: 'org-1',
      workspaceKey: 'acme/main',
    });
    expect(args).toContain('--user');
    expect(args.filter((arg) => arg === '--label')).toHaveLength(3);
    expect(args).toContain('harness.org=org-1');
    expect(args).toContain('harness.workspace=acme/main');
    expect(args).toContain('harness.image=node:22-bookworm');
    expect(args.filter((arg) => arg === '-v')).toHaveLength(2);
    expect(args).toContain('/srv/a:/srv/a');
    expect(args).toContain('/srv/b:/srv/b');
    expect(args.slice(-2)).toEqual(['sleep', 'infinity']);
  });
});

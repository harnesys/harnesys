import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';

const manifest = parseAddonManifest(
  await Bun.file(new URL('../addon.json', import.meta.url)).json(),
);

describe('harnesys.github manifest', () => {
  test('parses with the expected identity', () => {
    expect(manifest.id).toBe('harnesys.github');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.runtime).toEqual({ entry: 'dist/index.js', profile: 'trusted' });
  });

  test('declares the github connection and required permissions', () => {
    expect(manifest.connections).toEqual([
      {
        id: 'github',
        label: 'GitHub installation',
        accountKinds: ['github-installation'],
        cardinality: 'many',
      },
    ]);
    const permissionIds = manifest.permissions.map((permission) => permission.id);
    expect(permissionIds).toContain('http.fetch');
    expect(permissionIds).toContain('accounts.use');
  });

  test('exposes the legacy tool surface, trigger and route families', () => {
    const families = manifest.contributions.map((contribution) => contribution.family);
    expect(families).toContain('tool-pack');
    expect(families).toContain('trigger');
    expect(families).toContain('worker');
    expect(families).toContain('route');
    const pack = manifest.contributions.find((contribution) => contribution.family === 'tool-pack');
    if (pack === undefined) {
      throw new Error('tool-pack contribution is missing');
    }
    const descriptor = pack.descriptor as { tools: Array<{ name: string }> };
    const names = descriptor.tools.map((tool) => tool.name);
    for (const name of [
      'list_repos',
      'get_file',
      'search_code',
      'list_issues',
      'get_issue',
      'create_issue',
      'comment_issue',
      'close_issue',
      'add_labels',
      'list_pull_requests',
      'get_pull_request',
      'get_pull_request_diff',
      'create_pull_request',
      'update_pull_request',
      'comment_pull_request',
      'review_pull_request',
      'merge_pull_request',
      'list_workflow_runs',
      'get_workflow_run',
      'list_run_jobs',
      'rerun_workflow_run',
    ]) {
      expect(names).toContain(name);
    }
    const trigger = manifest.contributions.find(
      (contribution) => contribution.family === 'trigger',
    );
    if (trigger === undefined) {
      throw new Error('trigger contribution is missing');
    }
    expect((trigger.descriptor as { kind: string }).kind).toBe('github.repo-events');
  });
});

import { describe, expect, test } from 'bun:test';
import { nearestToolNames } from './tool-name-suggest.ts';

describe('nearestToolNames', () => {
  test('a pluralized tool name suggests the real one', () => {
    const registry = ['dashboard_templates_list', 'dashboards_get', 'read_file', 'write_file'];
    expect(nearestToolNames('dashboards_templates_list', registry)).toContain(
      'dashboard_templates_list',
    );
  });

  test('a distant name gets no suggestion', () => {
    expect(nearestToolNames('zzzqqqxx', ['read_file', 'write_file'])).toEqual([]);
  });

  test('suggestions are capped at three and sorted by closeness', () => {
    const registry = [
      'issue_create',
      'issue_create2',
      'issue_created',
      'issue_creates',
      'read_file',
    ];
    const out = nearestToolNames('issue_create', registry);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0]).toBe('issue_create2');
    expect(out).not.toContain('read_file');
  });
});

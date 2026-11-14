import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CursorMcpJson } from 'harnesys';
import { FsSkillRegistry } from 'harnesys/adapters/node';
import {
  type PluginRuntimeBundle,
  PluginRuntimePort,
} from '../../domain/plugin/plugin-runtime.port.ts';
import { SkillsEventsPort } from '../../domain/skills/skills-events.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import type { HostFsLayoutAdapter } from '../fs-layout/host-fs-layout.adapter.ts';

export class FakeExecutor extends LocalExecutorPort {
  invalidated: string[] = [];

  invalidateRuntime(orgId: string): Promise<void> {
    this.invalidated.push(orgId);
    return Promise.resolve();
  }

  lifecycle(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  events(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  sessionFor(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  send(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  compact = (): Promise<never> => Promise.reject(new Error('not used'));
  cancelCompact = (): Promise<never> => Promise.reject(new Error('not used'));
  undoThreadCompact = (): Promise<never> => Promise.reject(new Error('not used'));
  drainMessageQueue = (): Promise<never> => Promise.reject(new Error('not used'));
  steerMessageQueue(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  cancel(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  retry(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  truncateThreadFrom(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  removeThreadEvent(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  stream(): never {
    throw new Error('not used');
  }
  tickWaitTimers(): Promise<number> {
    return Promise.resolve(0);
  }
  countWaitingTimers(): Promise<number> {
    return Promise.resolve(0);
  }
  listMcpServers(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

export class FakeEvents extends SkillsEventsPort {
  published: { orgId: string; name?: string }[] = [];

  publish(orgId: string, event: { kind: 'changed'; name?: string }): void {
    this.published.push({ orgId, name: event.name });
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

export class FakePluginRuntime extends PluginRuntimePort {
  constructor(private readonly layout: HostFsLayoutAdapter) {
    super();
  }

  bundle(orgId: string): Promise<PluginRuntimeBundle> {
    const root = this.layout.skillsDir(orgId);
    const dirs = existsSync(root)
      ? readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => join(root, e.name))
      : [];
    return Promise.resolve(makeBundle(new FsSkillRegistry({ roots: [], skillDirs: dirs })));
  }

  invalidate(): void {}
}

export function makeBundle(registry: FsSkillRegistry): PluginRuntimeBundle {
  return {
    entries: [],
    skills: registry,
    mcpJson: {} as CursorMcpJson,
    agents: [],
    lspServers: [],
  };
}

import type { ConfigContribution } from './families/config.ts';
import type { ContentContribution } from './families/content.ts';
import type { HookContribution } from './families/hook.ts';
import type { RouteContribution } from './families/route.ts';
import type { ToolContribution } from './families/tool.ts';
import type { ViewContribution } from './families/view.ts';
import type { WorkerContribution } from './families/worker.ts';

export interface AddonRegistries {
  readonly tools: { register(contribution: ToolContribution): void };
  readonly contents: { register(contribution: ContentContribution): void };
  readonly views: { register(contribution: ViewContribution): void };
  readonly hooks: { register(contribution: HookContribution): void };
  readonly routes: { register(contribution: RouteContribution): void };
  readonly workers: { register(contribution: WorkerContribution): void };
  readonly configs: { register(contribution: ConfigContribution): void };
}

export type AddonRegisterFn = (registries: AddonRegistries) => void | Promise<void>;

export interface AddonDefinition {
  register: AddonRegisterFn;
}

export function defineAddon(definition: AddonDefinition): AddonDefinition {
  return definition;
}

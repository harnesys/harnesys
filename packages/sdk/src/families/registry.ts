import type { z } from 'zod';
import { configFamily } from './config.ts';
import { contentFamily } from './content.ts';
import { hookFamily } from './hook.ts';
import { jobFamily } from './job.ts';
import { lspFamily } from './lsp.ts';
import { mcpFamily } from './mcp.ts';
import { routeFamily } from './route.ts';
import { sourceKindFamily } from './source-kind.ts';
import { toolPackFamily } from './tool-pack.ts';
import { transportFamily } from './transport.ts';
import { triggerFamily } from './trigger.ts';
import { viewFamily } from './view.ts';
import { viewerFamily } from './viewer.ts';
import { workerFamily } from './worker.ts';

export interface FamilyDefinition {
  readonly family: string;
  readonly versions: readonly number[];
  schema(v: number): z.ZodType;
}

export const familyRegistry: Record<string, FamilyDefinition> = {
  'tool-pack': toolPackFamily,
  trigger: triggerFamily,
  job: jobFamily,
  worker: workerFamily,
  route: routeFamily,
  transport: transportFamily,
  hook: hookFamily,
  content: contentFamily,
  config: configFamily,
  view: viewFamily,
  'source-kind': sourceKindFamily,
  mcp: mcpFamily,
  lsp: lspFamily,
  viewer: viewerFamily,
};

export const FAMILY_NAMES = Object.keys(familyRegistry) as Array<keyof typeof familyRegistry>;

export function familyDefinition(family: string): FamilyDefinition | undefined {
  return familyRegistry[family];
}

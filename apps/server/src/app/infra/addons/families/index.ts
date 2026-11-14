import { ConfigFamilyModule } from './config/config.family.ts';
import { ContentFamilyModule } from './content/content.family.ts';
import type { AnyFamilyModule } from './family-module-list.ts';
import { HookFamilyModule } from './hook/hook.family.ts';
import { JobFamilyModule } from './job/job.family.ts';
import { LspFamilyModule } from './lsp/lsp.family.ts';
import { McpFamilyModule } from './mcp/mcp.family.ts';
import { RouteFamilyModule } from './route/route.family.ts';
import { SourceKindFamilyModule } from './source-kind/source-kind.family.ts';
import { ToolPackFamilyModule } from './tool-pack/tool-pack.family.ts';
import { TransportFamilyModule } from './transport/transport.family.ts';
import { TriggerFamilyModule } from './trigger/trigger.family.ts';
import { ViewFamilyModule } from './view/view.family.ts';
import { WorkerFamilyModule } from './worker/worker.family.ts';

export type FamilyModuleClass = new (...args: never[]) => AnyFamilyModule;

export const FAMILY_MODULE_CLASSES: readonly FamilyModuleClass[] = [
  ToolPackFamilyModule,
  TriggerFamilyModule,
  JobFamilyModule,
  WorkerFamilyModule,
  RouteFamilyModule,
  TransportFamilyModule,
  HookFamilyModule,
  ContentFamilyModule,
  ConfigFamilyModule,
  ViewFamilyModule,
  SourceKindFamilyModule,
  McpFamilyModule,
  LspFamilyModule,
];

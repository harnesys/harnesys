import { Injectable } from '@harnesys/brix';
import type { AddonManifest, ToolDescriptor, ToolPackDescriptor, Violation } from '@harnesys/sdk';
import { ToolPackDescriptorSchema } from '@harnesys/sdk';
import type { JsonSchema, PackRegistration } from 'harnesys';
import type { z } from 'zod';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import type { ToolCallResult } from '../../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import { PackRegistryPort } from '../../../../domain/capabilities/pack-registry.port.ts';
import { l10nText } from '../shared.ts';

type ToolPackSchema = z.infer<typeof ToolPackDescriptorSchema>;
type ToolEntry = ToolDescriptor;

const HANDLERS: readonly HandlerSpec[] = [handlerSpec('tools.call')];
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
const MAX_TOOL_TIMEOUT_MS = 600_000;

/**
 * LLM providers accept only `[a-zA-Z0-9_-]` in function names (Nvidia rejects dots
 * outright), while add-on ids are dot-namespaced. The agent-facing tool name is the
 * add-on id joined to the descriptor tool name with every unsafe character collapsed
 * to `_`; the add-on call still uses the original descriptor name.
 */
const UNSAFE_TOOL_NAME_CHAR = /[^a-zA-Z0-9_-]/g;

function exposedToolName(addonId: string, toolName: string): string {
  return `${addonId}.${toolName}`.replace(UNSAFE_TOOL_NAME_CHAR, '_');
}

@Injectable()
export class ToolPackFamilyModule implements FamilyModule<ToolPackSchema> {
  readonly family = 'tool-pack';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    private readonly packs: PackRegistryPort,
    private readonly calls: AddonCallPort,
  ) {}

  schema(_v: number): z.ZodType<ToolPackSchema> {
    return ToolPackDescriptorSchema as z.ZodType<ToolPackSchema>;
  }

  crossCheck(d: ToolPackDescriptor, manifest: AddonManifest): readonly Violation[] {
    const violations: Violation[] = [];
    const connectionIds = new Set(manifest.connections.map((connection) => connection.id));
    const contentIds = new Set(
      manifest.contributions
        .filter((contribution) => contribution.family === 'content')
        .map((contribution) => contribution.id),
    );
    if (d.connection !== undefined && !connectionIds.has(d.connection)) {
      violations.push({
        path: `${manifest.id}.pack.${d.name}.connection`,
        code: 'unknown_connection',
        message: `connection '${d.connection}' is not declared in manifest.connections`,
        severity: 'error',
      });
    }
    for (const skillId of d.skills ?? []) {
      if (!contentIds.has(skillId)) {
        violations.push({
          path: `${manifest.id}.pack.${d.name}.skills`,
          code: 'unknown_skill',
          message: `skill '${skillId}' has no content contribution in this addon`,
          severity: 'error',
        });
      }
    }
    return violations;
  }

  register(owner: OwnerKey, d: ToolPackSchema): Disposable {
    const packName = `${owner.addonId}.${d.name}`;
    this.packs.register(packName, this.buildRegistration(owner, d));
    return {
      dispose: () => {
        this.packs.unregister(packName);
      },
    };
  }

  private buildRegistration(owner: OwnerKey, d: ToolPackSchema): PackRegistration {
    return {
      pack: {
        name: `${owner.addonId}.${d.name}`,
        version: owner.version,
        description: l10nText(d.description),
        icon: d.icon,
        meta: {
          tools: d.tools.map((tool) => ({
            name: exposedToolName(owner.addonId, tool.name),
            description: l10nText(tool.description),
          })),
          skills: d.skills ?? [],
          hasSettings: (d.specFields?.length ?? 0) > 0,
        },
        create: () => ({
          tools: d.tools.map((tool) => this.buildTool(owner, d, tool)),
        }),
      },
    };
  }

  private buildTool(owner: OwnerKey, d: ToolPackSchema, tool: ToolEntry) {
    return {
      name: exposedToolName(owner.addonId, tool.name),
      description: l10nText(tool.description),
      input: tool.inputSchema as JsonSchema,
      sideEffect: tool.effect,
      execute: (input: unknown): Promise<ToolCallResult> =>
        this.calls.callTool(
          owner.orgId,
          owner.addonId,
          {
            pack: d.name,
            tool: tool.name,
            input: (input ?? {}) as Record<string, unknown>,
          },
          {
            timeoutMs: Math.min(
              tool.timeoutSec ? tool.timeoutSec * 1000 : DEFAULT_TOOL_TIMEOUT_MS,
              MAX_TOOL_TIMEOUT_MS,
            ),
          },
        ),
    };
  }
}

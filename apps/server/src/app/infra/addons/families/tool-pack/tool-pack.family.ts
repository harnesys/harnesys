import { Injectable, Logger } from '@harnesys/brix';
import type { AddonManifest, ToolDescriptor, ToolPackDescriptor, Violation } from '@harnesys/sdk';
import { ToolPackDescriptorSchema } from '@harnesys/sdk';
import type { JsonSchema, PackRegistration, PackSkill } from 'harnesys';
import type { z } from 'zod';
import { AddonManifestInvalidException } from '../../../../domain/addons/errors.ts';
import { exposedToolName } from '../../../../domain/addons/exposed-tool-name.ts';
import type { FamilyModule, HandlerSpec } from '../../../../domain/addons/family-module.ts';
import { handlerSpec } from '../../../../domain/addons/family-module.ts';
import type { Disposable, OwnerKey } from '../../../../domain/addons/owner.ts';
import type { ToolCallResult } from '../../../../domain/addons/ports/addon-call.port.ts';
import { AddonCallPort } from '../../../../domain/addons/ports/addon-call.port.ts';
import { PackRegistryPort } from '../../../../domain/capabilities/pack-registry.port.ts';
import { AddonContentRegistry } from '../content/content.family.ts';
import { loadAddonSkill, locateSkillSource } from '../content/skill-source.ts';
import { l10nText } from '../shared.ts';

type ToolPackSchema = z.infer<typeof ToolPackDescriptorSchema>;
type ToolEntry = ToolDescriptor;

const HANDLERS: readonly HandlerSpec[] = [handlerSpec('tools.call')];
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
const MAX_TOOL_TIMEOUT_MS = 600_000;

@Injectable()
export class ToolPackFamilyModule implements FamilyModule<ToolPackSchema> {
  readonly family = 'tool-pack';
  readonly versions = [1] as const;
  readonly handlers = HANDLERS;
  readonly permissions: readonly string[] = [];

  constructor(
    private readonly packs: PackRegistryPort,
    private readonly calls: AddonCallPort,
    private readonly content: AddonContentRegistry,
    private readonly logger: Logger,
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
    this.assertExposedNamesFree(packName, d);
    this.packs.register(packName, this.buildRegistration(owner, d));
    return {
      dispose: () => {
        this.packs.unregister(packName);
      },
    };
  }

  /**
   * Agent-facing tool names share one flat namespace per model call — the core packs and
   * every add-on pack land in the same registry — so a pack whose `<pack>_<tool>` is
   * already taken would shadow the holder tool by tool. Reject the activation instead:
   * the pack has to be renamed. The pack's own registration (a version swap) is skipped.
   */
  private assertExposedNamesFree(packName: string, d: ToolPackSchema): void {
    const claimed = new Map<string, string>();
    for (const registration of this.packs.registrations()) {
      if (registration.pack.name === packName) {
        continue;
      }
      for (const tool of registration.pack.meta.tools) {
        claimed.set(tool.name, registration.pack.name);
      }
    }
    const violations: Violation[] = [];
    const mine = new Set<string>();
    for (const tool of d.tools) {
      const name = exposedToolName(d.name, tool.name);
      const path = `${packName}.tools.${tool.name}`;
      if (mine.has(name)) {
        violations.push({
          path,
          code: 'duplicate_tool_name',
          message: `pack ${packName} exposes tool name '${name}' twice`,
          severity: 'error',
        });
        continue;
      }
      mine.add(name);
      const holder = claimed.get(name);
      if (holder !== undefined) {
        violations.push({
          path,
          code: 'tool_name_taken',
          message: `tool name '${name}' is already exposed by pack ${holder}`,
          severity: 'error',
        });
      }
    }
    if (violations.length > 0) {
      throw new AddonManifestInvalidException(violations);
    }
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
            name: exposedToolName(d.name, tool.name),
            description: l10nText(tool.description),
          })),
          skills: d.skills ?? [],
          hasSettings: (d.specFields?.length ?? 0) > 0,
        },
        create: () => ({
          tools: d.tools.map((tool) => this.buildTool(owner, d, tool)),
          skills: this.buildSkills(owner, d),
        }),
      },
    };
  }

  /**
   * Emits the pack's `skills` as embedded `PackSkill`s so the agent receives the
   * same skill files the content family registered, independent of its allowlist.
   */
  private buildSkills(owner: OwnerKey, d: ToolPackSchema): PackSkill[] {
    const skills: PackSkill[] = [];
    for (const skillId of d.skills ?? []) {
      const entry = this.content.find(owner, skillId);
      if (entry === undefined || entry.kind !== 'skill' || entry.resolvedPath === null) {
        this.logger.warn(
          { addonId: owner.addonId, pack: d.name, skill: skillId },
          'pack skill contribution unavailable',
        );
        continue;
      }
      const resolution = locateSkillSource(entry.resolvedPath);
      if (!resolution.ok) {
        this.logger.warn(
          { addonId: owner.addonId, pack: d.name, skill: skillId, reason: resolution.reason },
          'pack skill source not resolved',
        );
        continue;
      }
      const loaded = loadAddonSkill({
        addonId: owner.addonId,
        skillId,
        title: l10nText(entry.title),
        location: resolution.location,
        logger: this.logger,
      });
      if (!loaded.ok) {
        this.logger.warn(
          { addonId: owner.addonId, pack: d.name, skill: skillId, reason: loaded.reason },
          'pack skill not emitted',
        );
        continue;
      }
      skills.push({
        name: loaded.skill.name,
        description: loaded.skill.description,
        ...(loaded.skill.whenToUse !== undefined ? { whenToUse: loaded.skill.whenToUse } : {}),
        body: loaded.skill.body,
        files: loaded.skill.files,
      });
    }
    return skills;
  }

  private buildTool(owner: OwnerKey, d: ToolPackSchema, tool: ToolEntry) {
    return {
      name: exposedToolName(d.name, tool.name),
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

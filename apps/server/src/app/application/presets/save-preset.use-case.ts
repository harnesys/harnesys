import { Injectable } from '@harnesys/brix';
import type { PresetDetail, SavePresetBody, TeamPresetBody } from '@harnesys/contracts';
import { validateStatuses } from '../../domain/issue/board-validation.ts';
import {
  PresetConflictException,
  PresetImmutableException,
  PresetValidationException,
} from '../../domain/presets/preset.error.ts';
import { PresetLibraryPort } from '../../domain/presets/preset-library.port.ts';
import { toPresetDetail } from '../../domain/presets/preset-view.ts';
import { missingAgentRefs } from '../../infra/presets/preset-envelope.ts';
import { ownerOf, type PresetPathInput } from './preset-path.ts';
import { nextVersion } from './preset-versioning.ts';

const SYSTEM_OWNER = 'harnesys';

export interface SavePresetRequest {
  body: SavePresetBody;
  path?: PresetPathInput;
}

@Injectable()
export class SavePresetUseCase {
  constructor(private readonly library: PresetLibraryPort) {}

  execute(request: SavePresetRequest): PresetDetail {
    const { body } = request;
    this.assertPathMatches(request);
    const existing = this.library.findAnyById(body.id);
    if (existing !== null && existing.kind !== body.kind) {
      throw new PresetConflictException(`preset id is taken by another kind: ${body.id}`, {
        id: body.id,
      });
    }
    if (existing !== null && existing.origin === 'system') {
      throw new PresetImmutableException(`system presets are immutable: ${body.id}`, {
        id: body.id,
      });
    }
    if (ownerOf(body.id) === SYSTEM_OWNER) {
      throw new PresetValidationException('the harnesys namespace is reserved for system presets', {
        id: body.id,
      });
    }
    if (body.kind === 'team') {
      validateTeamBody(body.body, (ref) => this.library.findById('agent', ref) !== null);
    }
    const record = this.library.save({
      id: body.id,
      kind: body.kind,
      origin: 'user',
      version: nextVersion(existing?.version ?? null, body.version),
      name: body.name,
      description: body.description ?? null,
      author: existing?.author ?? null,
      installedFrom: existing?.installedFrom ?? null,
      tags: body.tags ?? [],
      body: body.body,
    });
    return toPresetDetail(record);
  }

  private assertPathMatches(request: SavePresetRequest): void {
    if (request.path === undefined) {
      return;
    }
    if (request.path.id !== request.body.id) {
      throw new PresetValidationException(
        `preset id in body does not match the path: ${request.body.id}`,
        { id: request.body.id },
      );
    }
    if (request.path.kind !== request.body.kind) {
      throw new PresetValidationException(
        `preset kind in body does not match the path: ${request.body.kind}`,
        { id: request.body.id },
      );
    }
  }
}

export function validateTeamBody(
  body: TeamPresetBody,
  agentExists: (ref: string) => boolean,
): void {
  const issues = validateStatuses(body.board.statuses);
  if (issues.length > 0) {
    throw new PresetValidationException('preset board has invalid statuses', issues);
  }
  const roleKeys = new Set(body.roles.map((role) => role.roleKey));
  for (const rule of body.board.rules) {
    for (const action of rule.actions) {
      if (action.type === 'assign_agent' && !roleKeys.has(action.roleKey)) {
        throw new PresetValidationException(`rule references an unknown role: ${action.roleKey}`, {
          roleKey: action.roleKey,
        });
      }
    }
  }
  const missing = missingAgentRefs(body, agentExists);
  if (missing.length > 0) {
    throw new PresetValidationException(`unknown agent presets: ${missing.join(', ')}`, missing);
  }
}

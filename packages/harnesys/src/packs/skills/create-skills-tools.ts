import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import type { SkillsPackPorts } from './skills-ports.ts';

function actorFor(ctx: { agentId?: string }): string {
  return `agent:${ctx.agentId ?? '_'}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

function searchLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(value)));
}

export function createSkillsTools(ports: SkillsPackPorts): ToolDefinition[] {
  return [
    tool('create_skill', {
      group: 'skills',
      description:
        'Create a new skill for the current organization from a short description and markdown instructions. The skill becomes available in the org catalog and can be granted to agents.',
      operations: ['fs.write'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Kebab-case skill name, e.g. "release-checklist"' },
          description: {
            type: 'string',
            description: 'One-sentence description of what the skill does',
          },
          whenToUse: { type: 'string', description: 'Optional hint when the skill should be used' },
          instructions: { type: 'string', description: 'Markdown body of SKILL.md' },
        },
        required: ['name', 'description', 'instructions'],
      },
      async execute(input, ctx) {
        const parsed = input as {
          name: string;
          description: string;
          whenToUse?: string;
          instructions: string;
        };
        try {
          const orgId = ports.resolveOrgId();
          if (orgId === undefined) {
            return { error: 'organization scope is not available' };
          }
          return await ports.createSkill({
            orgId,
            actor: actorFor(ctx),
            body: {
              name: parsed.name,
              description: parsed.description,
              ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
              instructions: parsed.instructions,
            },
          });
        } catch (err) {
          return { error: errorMessage(err) };
        }
      },
    }),
    tool('list_skills', {
      group: 'skills',
      description:
        'List skills visible to the current organization across all tiers (org, system, host, sources, plugins). Compact entries only: name, origin (tier, with source or plugin name), installedFrom when the skill came from a repository, and updateAvailable when an update is pending. No bodies — use load_skill for the full text.',
      sideEffect: 'read',
      input: { type: 'object' },
      async execute() {
        try {
          const orgId = ports.resolveOrgId();
          if (orgId === undefined) {
            return { error: 'organization scope is not available' };
          }
          return await ports.listSkills(orgId);
        } catch (err) {
          return { error: errorMessage(err) };
        }
      },
    }),
    tool('delete_skill', {
      group: 'skills',
      description:
        'Delete a skill owned by the current organization (origin "org"): removes its files and invalidates runtime copies. Skills from other tiers are refused and the error names the tier (e.g. "skill is managed outside the organization: system"); manage those outside this tool.',
      operations: ['fs.write'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name exactly as returned by list_skills' },
        },
        required: ['name'],
      },
      async execute(input) {
        const parsed = input as { name: string };
        try {
          const orgId = ports.resolveOrgId();
          if (orgId === undefined) {
            return { error: 'organization scope is not available' };
          }
          await ports.deleteSkill({ orgId, name: parsed.name });
          return { deleted: parsed.name };
        } catch (err) {
          return { error: errorMessage(err) };
        }
      },
    }),
    tool('install_skill', {
      group: 'skills',
      description:
        'Install skills into the current organization from a git repository URL (or GitHub owner/repo shorthand). Clones the repo and lists candidate skills; install one by name with `skill`, every candidate with `all: true`, or omit both when the repo contains a single skill. With several candidates and no selection returns the candidate list instead of installing.',
      operations: ['network', 'fs.write'],
      sideEffect: 'write',
      input: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Repository URL or GitHub owner/repo shorthand' },
          ref: { type: 'string', description: 'Optional branch, tag, or commit' },
          skill: {
            type: 'string',
            description:
              'Skill to install from a multi-skill repo: its name or full subPath exactly as listed in the candidate list (e.g. ".agents/skills/market-research"). If several candidates share a name, pass the full subPath of the one you want.',
          },
          all: { type: 'boolean', description: 'Install every candidate skill found in the repo' },
        },
        required: ['source'],
      },
      async execute(input, ctx) {
        const parsed = input as { source: string; ref?: string; skill?: string; all?: boolean };
        try {
          const orgId = ports.resolveOrgId();
          if (orgId === undefined) {
            return { error: 'organization scope is not available' };
          }
          return await ports.installSkill({
            orgId,
            actor: actorFor(ctx),
            source: parsed.source,
            ...(parsed.ref !== undefined ? { ref: parsed.ref } : {}),
            ...(parsed.skill !== undefined ? { skill: parsed.skill } : {}),
            ...(parsed.all !== undefined ? { all: parsed.all } : {}),
          });
        } catch (err) {
          return { error: errorMessage(err) };
        }
      },
    }),
    tool('search_skills', {
      group: 'skills',
      description:
        'Search the public skills.sh registry for skills matching a query. Returns ranked hits with install counts and repository URLs, truncated to `limit` results (default 10) with a `more` count when trimmed; feed a hit into install_skill to install it.',
      operations: ['network'],
      sideEffect: 'read',
      input: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query, at least 2 characters' },
          limit: {
            type: 'integer',
            description: `Maximum hits to return (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT})`,
          },
        },
        required: ['query'],
      },
      async execute(input) {
        const parsed = input as { query: string; limit?: number };
        try {
          const result = await ports.searchSkills(parsed.query);
          const limit = searchLimit(parsed.limit);
          const results = result.results.slice(0, limit);
          const more = result.results.length - results.length;
          return {
            results,
            ...(more > 0 ? { more } : {}),
            ...(result.degraded === undefined ? {} : { degraded: result.degraded }),
            ...(result.hint === undefined ? {} : { hint: result.hint }),
          };
        } catch (err) {
          return { error: errorMessage(err) };
        }
      },
    }),
  ];
}

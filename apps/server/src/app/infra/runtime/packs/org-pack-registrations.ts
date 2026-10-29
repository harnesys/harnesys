import type { CapabilityScope, HostEngineEntry, ProcessJobRegistry } from 'harnesys';
import {
  agentsCapability,
  coreCapability,
  filesCapability,
  githubCapability,
  googleCapability,
  imageCapability,
  issuesCapability,
  managerCapability,
  mcpCapability,
  planCapability,
  registerPack,
  shellCapability,
} from 'harnesys';
import { lspCapability } from 'harnesys/lsp';
import { skillsCapability } from 'harnesys/skills';
import type { LspPort } from '../../../domain/lsp/lsp.port.ts';
import { scopedLspPort } from '../../lsp/scoped-lsp.port.ts';
import { getHostToolScope } from '../host-tool-scope.ts';
import { OrgAgentsCatalogPort } from './org-agents-catalog.port.ts';
import { OrgGithubPort } from './org-github.port.ts';
import { OrgGooglePort } from './org-google.port.ts';
import { OrgImageGenerationPort } from './org-image.port.ts';
import { OrgIssuePort } from './org-issue.port.ts';
import { OrgManagerPort } from './org-manager.port.ts';
import { isHostWired } from './org-pack-list.ts';
import {
  knowledgeRegistration,
  memoryRegistration,
  schedulerRegistration,
  threadAttachmentPortOf,
  threadsRegistration,
  webhookRegistration,
  webRegistration,
} from './org-pack-registrations.helpers.ts';
import { OrgPlanPort } from './org-plan.port.ts';
import { OrgSkillsPackPort } from './org-skills.pack.port.ts';
import type { WireOrgPacksDeps } from './wire-org-packs.ts';

export interface WireOrgPackContext {
  deps: WireOrgPacksDeps;
  lsp?: LspPort;
  engineSnapshot?: HostEngineEntry[];
  jobs: ProcessJobRegistry;
  agentsPort: OrgAgentsCatalogPort;
  stubScope: () => CapabilityScope;
  liveScope: () => CapabilityScope;
}

export function registrationForPack(packName: string, ctx: WireOrgPackContext) {
  if (!isHostWired(packName)) {
    return undefined;
  }
  switch (packName) {
    case 'core':
      return registerPack(coreCapability, { resolveScope: ctx.stubScope });
    case 'files':
      return registerPack(filesCapability, { resolveScope: ctx.stubScope });
    case 'image':
      return imageRegistration(ctx);
    case 'shell':
      return shellRegistration(ctx);
    case 'web':
      return webRegistration(ctx);
    case 'google':
      return googleRegistration(ctx);
    case 'github':
      return githubRegistration(ctx);
    case 'lsp':
      return lspRegistration(ctx);
    case 'agents':
      return registerPack(agentsCapability, {
        ports: { agents: ctx.agentsPort },
        resolveScope: ctx.liveScope,
      });
    case 'mcp':
      return mcpRegistration(ctx);
    case 'plan':
      return planRegistration(ctx);
    case 'pin-memory':
    case 'semantic-memory':
    case 'episodic-memory':
      return memoryRegistration(packName, ctx);
    case 'threads':
      return threadsRegistration(ctx);
    case 'scheduler':
      return schedulerRegistration(ctx);
    case 'webhook':
      return webhookRegistration(ctx);
    case 'issues':
      return issuesRegistration(ctx);
    case 'manager':
      return managerRegistration(ctx);
    case 'knowledge-memory':
      return knowledgeRegistration(ctx);
    case 'skills':
      return skillsRegistration(ctx);
    default:
      return undefined;
  }
}

function imageRegistration(ctx: WireOrgPackContext) {
  const { secrets, layout, providers, models } = ctx.deps;
  const attachments = threadAttachmentPortOf(ctx);
  if (!secrets || !layout || !attachments) {
    return undefined;
  }
  return registerPack(imageCapability, {
    ports: {
      image: new OrgImageGenerationPort({
        orgId: ctx.deps.orgId,
        providers,
        models,
        secrets,
        attachments,
      }),
    },
    resolveScope: ctx.liveScope,
  });
}

function googleRegistration(ctx: WireOrgPackContext) {
  const google = ctx.deps.google;
  const attachments = threadAttachmentPortOf(ctx);
  if (!google || !attachments) {
    return undefined;
  }
  return registerPack(googleCapability, {
    ports: { google: new OrgGooglePort(google, attachments) },
    resolveScope: ctx.liveScope,
  });
}

function githubRegistration(ctx: WireOrgPackContext) {
  const github = ctx.deps.github;
  if (!github) {
    return undefined;
  }
  return registerPack(githubCapability, {
    ports: { github: new OrgGithubPort(github) },
    resolveScope: ctx.liveScope,
  });
}

function shellRegistration(ctx: WireOrgPackContext) {
  return registerPack(shellCapability, {
    ports: {
      jobs: ctx.jobs,
      resolveOrgId: () => getHostToolScope()?.orgId ?? ctx.deps.orgId,
    },
    resolveScope: ctx.stubScope,
  });
}

function lspRegistration(ctx: WireOrgPackContext) {
  if (ctx.lsp === undefined) {
    return undefined;
  }
  return registerPack(lspCapability, {
    ports: { lsp: scopedLspPort(ctx.lsp) },
    resolveScope: ctx.stubScope,
  });
}

function planRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.planDb) {
    return undefined;
  }
  return registerPack(planCapability, {
    ports: { plan: new OrgPlanPort(ctx.deps.planDb, ctx.deps.planEvents) },
    resolveScope: ctx.liveScope,
  });
}

function issuesRegistration(ctx: WireOrgPackContext) {
  const tracker =
    ctx.deps.issueTracker ?? (ctx.deps.issues ? new OrgIssuePort(ctx.deps.issues) : null);
  if (!tracker) {
    return undefined;
  }
  return registerPack(issuesCapability, {
    ports: { issues: tracker },
    resolveScope: ctx.liveScope,
  });
}

function managerRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.manager) {
    return undefined;
  }
  return registerPack(managerCapability, {
    ports: { observation: new OrgManagerPort(ctx.deps.manager) },
    resolveScope: ctx.liveScope,
  });
}

function skillsRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.skills) {
    return undefined;
  }
  return registerPack(skillsCapability, {
    ports: new OrgSkillsPackPort(ctx.deps.skills),
    resolveScope: ctx.liveScope,
  });
}

function mcpRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.mcpManage) {
    return undefined;
  }
  return registerPack(mcpCapability, {
    ports: { mcp: ctx.deps.mcpManage },
    resolveScope: ctx.liveScope,
  });
}

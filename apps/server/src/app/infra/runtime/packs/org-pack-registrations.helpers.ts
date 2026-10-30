import type { HostEngineEntry } from 'harnesys';
import {
  episodicMemoryCapability,
  knowledgeMemoryCapability,
  pinMemoryCapability,
  registerPack,
  schedulerCapability,
  semanticMemoryCapability,
  threadsCapability,
  webCapability,
  webhookCapability,
} from 'harnesys';
import { resolveProviderApiKey } from '../../../domain/secret/provider-api-key.ts';
import { StudioEmbeddings } from '../../knowledge/embeddings.ts';
import { embedModelIdOf } from '../../memory/org-memory-settings.store.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { OrgEpisodicPort } from './org-episodic.port.ts';
import { OrgKnowledgePort } from './org-knowledge.port.ts';
import type { WireOrgPackContext } from './org-pack-registrations.ts';
import { OrgPinPort } from './org-pin.port.ts';
import { OrgSchedulerPort } from './org-scheduler.port.ts';
import { OrgSemanticPort } from './org-semantic.port.ts';
import { OrgThreadAttachmentPort } from './org-thread-attachment.port.ts';
import { OrgThreadsPort } from './org-threads.port.ts';
import { OrgWebhookPort } from './org-webhook.port.ts';
import type { WireOrgPacksDeps } from './wire-org-packs.ts';

export function webRegistration(ctx: WireOrgPackContext) {
  const engines =
    ctx.engineSnapshot !== undefined
      ? (): HostEngineEntry[] => ctx.engineSnapshot ?? []
      : undefined;
  return registerPack(webCapability, {
    ports: {
      ...(engines !== undefined ? { engines } : {}),
      ...(ctx.deps.orgSettings !== undefined
        ? {
            orgDefaultEngine: () => ctx.deps.orgSettings?.get(ctx.deps.orgId).browser.defaultEngine,
          }
        : {}),
    },
    resolveScope: ctx.stubScope,
  });
}

function pinnedEmbeddingRef(
  deps: WireOrgPacksDeps,
  memoryDb: OrgSqliteDb,
): { provider: string; model: string } | undefined {
  const modelId = embedModelIdOf(memoryDb, deps.orgId);
  if (!modelId) {
    return undefined;
  }
  const model = deps.models.findById(deps.orgId, modelId);
  const provider = model ? deps.providers.findById(deps.orgId, model.providerId) : undefined;
  return model && provider ? { provider: provider.name, model: model.name } : undefined;
}

export function memoryRegistration(packName: string, ctx: WireOrgPackContext) {
  const memoryDb = ctx.deps.memoryDb;
  if (!memoryDb) {
    return undefined;
  }
  if (packName === 'pin-memory') {
    return registerPack(pinMemoryCapability, {
      ports: { pin: new OrgPinPort(memoryDb) },
      resolveScope: ctx.liveScope,
    });
  }
  if (packName === 'semantic-memory') {
    return semanticRegistration(ctx, memoryDb);
  }
  return registerPack(episodicMemoryCapability, {
    ports: { episodic: new OrgEpisodicPort(memoryDb) },
    resolveScope: ctx.liveScope,
  });
}

function semanticRegistration(ctx: WireOrgPackContext, memoryDb: OrgSqliteDb) {
  const { secrets } = ctx.deps;
  const embeddings = new StudioEmbeddings({
    providers: ctx.deps.providers,
    models: ctx.deps.models,
    orgId: ctx.deps.orgId,
    modelRef: pinnedEmbeddingRef(ctx.deps, memoryDb),
    ...(secrets
      ? {
          resolveApiKey: (provider: { id: string; apiKey: string | null }) =>
            resolveProviderApiKey(secrets, ctx.deps.orgId, provider.id, provider.apiKey),
        }
      : {}),
  });
  return registerPack(semanticMemoryCapability, {
    ports: { semantic: new OrgSemanticPort(memoryDb, embeddings) },
    resolveScope: ctx.liveScope,
  });
}

export function threadsRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.threads) {
    return undefined;
  }
  return registerPack(threadsCapability, {
    ports: {
      threads: new OrgThreadsPort({
        threads: ctx.deps.threads,
        agents: ctx.deps.agents,
        ...(ctx.deps.schedules ? { schedules: ctx.deps.schedules } : {}),
      }),
    },
    resolveScope: ctx.liveScope,
  });
}

export function schedulerRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.schedules || !ctx.deps.threads || !ctx.deps.orgSettings) {
    return undefined;
  }
  return registerPack(schedulerCapability, {
    ports: {
      scheduler: new OrgSchedulerPort({
        schedules: ctx.deps.schedules,
        threads: ctx.deps.threads,
        agents: ctx.deps.agents,
        orgSettings: ctx.deps.orgSettings,
        ...(ctx.deps.deskEvents ? { deskEvents: ctx.deps.deskEvents } : {}),
      }),
    },
    resolveScope: ctx.liveScope,
  });
}

export function webhookRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.webhooks || !ctx.deps.threads) {
    return undefined;
  }
  return registerPack(webhookCapability, {
    ports: {
      webhook: new OrgWebhookPort({
        webhooks: ctx.deps.webhooks,
        threads: ctx.deps.threads,
        agents: ctx.deps.agents,
        ...(ctx.deps.deskEvents ? { deskEvents: ctx.deps.deskEvents } : {}),
      }),
    },
    resolveScope: ctx.liveScope,
  });
}

export function knowledgeRegistration(ctx: WireOrgPackContext) {
  if (!ctx.deps.knowledge || !ctx.deps.sources) {
    return undefined;
  }
  return registerPack(knowledgeMemoryCapability, {
    ports: {
      knowledge: new OrgKnowledgePort({
        orgId: ctx.deps.orgId,
        search: ctx.deps.knowledge.search,
        store: ctx.deps.knowledge.store,
        sources: ctx.deps.sources,
        resolveScope: ctx.liveScope,
      }),
    },
    resolveScope: ctx.liveScope,
  });
}

export function threadAttachmentPortOf(
  ctx: WireOrgPackContext,
): OrgThreadAttachmentPort | undefined {
  const { threads, layout } = ctx.deps;
  if (!threads || !layout) {
    return undefined;
  }
  return new OrgThreadAttachmentPort({ threads, layout });
}

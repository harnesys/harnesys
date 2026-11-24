import type { HostEngineEntry } from 'harnesys';
import {
  browserToolsRoot,
  knowledgeMemoryCapability,
  managedAgentBrowserInstall,
  pinMemoryCapability,
  registerPack,
  semanticMemoryCapability,
  threadsCapability,
  webCapability,
} from 'harnesys';
import { StudioEmbeddings } from '../../../domain/knowledge/embeddings.ts';
import { resolveProviderApiKey } from '../../../domain/secret/provider-api-key.ts';
import { embedModelIdOf } from '../../memory/org-memory-settings.store.ts';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { getHostToolScope } from '../host-tool-scope.ts';
import { OrgEpisodicPort } from './org-episodic.port.ts';
import { OrgKnowledgePort } from './org-knowledge.port.ts';
import type { WireOrgPackContext } from './org-pack-registrations.ts';
import { OrgPinPort } from './org-pin.port.ts';
import { OrgSemanticPort } from './org-semantic.port.ts';
import { OrgThreadAttachmentPort } from './org-thread-attachment.port.ts';
import { OrgThreadsPort } from './org-threads.port.ts';
import type { WireOrgPacksDeps } from './wire-org-packs.ts';

function auditResultOf(denied: boolean | undefined, ok: boolean): 'ok' | 'denied' | 'failed' {
  if (denied === true) {
    return 'denied';
  }
  return ok ? 'ok' : 'failed';
}

export function webRegistration(ctx: WireOrgPackContext) {
  const engines =
    ctx.engineSnapshot !== undefined
      ? (): HostEngineEntry[] => ctx.engineSnapshot ?? []
      : undefined;
  const browserLogin = ctx.deps.browserLogin;
  const scope = () => getHostToolScope();
  const orgIdOf = () => scope()?.orgId ?? ctx.deps.orgId;
  const agentIdOf = () => scope()?.agentId ?? '_';
  const hardenedPorts =
    browserLogin === undefined
      ? {}
      : {
          credentialResolver: (credentialId: string) =>
            browserLogin.resolve.resolve({
              orgId: orgIdOf(),
              agentId: agentIdOf(),
              credentialId,
            }),
          credentialGet: (credentialId: string) =>
            browserLogin.resolve.get({
              orgId: orgIdOf(),
              agentId: agentIdOf(),
              credentialId,
            }),
          credentialStatus: (credentialId: string) =>
            browserLogin.resolve.status({
              orgId: orgIdOf(),
              agentId: agentIdOf(),
              credentialId,
            }),
          credentialList: () =>
            browserLogin.resolve.listGranted({
              orgId: orgIdOf(),
              agentId: agentIdOf(),
            }),
          egressProxy: (input: {
            scopeKey: string;
            credentialId: string;
            hosts: readonly string[];
          }) => browserLogin.egress.start({ orgId: orgIdOf(), ...input }),
          loginResult: (input: { credentialId: string; ok: boolean; targetOrigin: string }) =>
            browserLogin.loginResult({
              orgId: orgIdOf(),
              credentialId: input.credentialId,
              ok: input.ok,
              targetOrigin: input.targetOrigin,
            }),
          loginAttempts: {
            start: (input: { credentialId: string; kind: 'challenge' | 'manual' }) =>
              browserLogin.attempts.start({
                orgId: orgIdOf(),
                credentialId: input.credentialId,
                kind: input.kind,
                runId: null,
                threadId: scope()?.threadId ?? null,
              }),
            takeInput: (attemptId: string) => browserLogin.attempts.takeInput(orgIdOf(), attemptId),
            complete: (attemptId: string) => browserLogin.attempts.complete(orgIdOf(), attemptId),
          },
          audit: (entry: {
            orgId: string;
            threadId: string;
            credentialId: string;
            targetOrigin: string;
            ok: boolean;
            denied?: boolean;
            attemptId?: string;
          }) => {
            browserLogin.audit.append(entry.orgId, {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              actorKind: 'system',
              actorId: `browser-login:${entry.credentialId}`,
              viaNodeId: null,
              action: 'browser.login',
              resource: `${entry.credentialId}/${entry.targetOrigin}`,
              result: auditResultOf(entry.denied, entry.ok),
            });
          },
        };
  return registerPack(webCapability, {
    ports: {
      ...(engines !== undefined ? { engines } : {}),
      ...(ctx.deps.orgSettings !== undefined
        ? {
            orgDefaultEngine: () => ctx.deps.orgSettings?.get(ctx.deps.orgId).browser.defaultEngine,
          }
        : {}),
      agentBrowserBin: () => {
        const home = ctx.deps.layout?.home();
        if (home === undefined) {
          return null;
        }
        return managedAgentBrowserInstall(browserToolsRoot(home))?.path ?? null;
      },
      ...hardenedPorts,
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
  return semanticRegistration(ctx, memoryDb);
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
  if (!ctx.deps.threads || !ctx.deps.threadAgents) {
    return undefined;
  }
  const memoryDb = ctx.deps.memoryDb;
  return registerPack(threadsCapability, {
    ports: {
      threads: new OrgThreadsPort({
        threads: ctx.deps.threads,
        threadAgents: ctx.deps.threadAgents,
        agents: ctx.deps.agents,
        ...(ctx.deps.events ? { events: ctx.deps.events } : {}),
        ...(memoryDb ? { episodic: new OrgEpisodicPort(memoryDb) } : {}),
        ...(ctx.deps.manager ? { tail: ctx.deps.manager.tail } : {}),
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

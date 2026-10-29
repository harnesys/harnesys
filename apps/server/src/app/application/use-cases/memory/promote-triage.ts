import { isDriver } from 'harnesys';
import type { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import type { AgentModelCoords } from './consolidate-thread-model.ts';

export type DecisionModelCoordsResolver = () => AgentModelCoords | undefined;

export interface PromoteCandidate {
  id: string;
  text: string;
}

export function findDecisionModelCoords(input: {
  orgId: string;
  providers: LlmProviderPort;
  models: LlmModelPort;
  decisionModelId?: string | undefined;
}): AgentModelCoords | undefined {
  if (input.decisionModelId) {
    const pinned = input.models.findById(input.orgId, input.decisionModelId);
    const provider = pinned ? input.providers.findById(input.orgId, pinned.providerId) : undefined;
    if (pinned && provider && pinned.kind === 'decision') {
      return { provider: provider.name, model: pinned.name, modelId: pinned.id };
    }
  }
  for (const provider of input.providers.list(input.orgId)) {
    if (!provider.enabled || !isDriver(provider.driver)) {
      continue;
    }
    const model = input.models
      .listByProvider(input.orgId, provider.id)
      .find((m) => m.kind === 'decision');
    if (!model) {
      continue;
    }
    return { provider: provider.name, model: model.name, modelId: model.id };
  }
  return undefined;
}

const PROMOTE_TRIAGE_RUBRIC = [
  'You triage memory promotion candidates for an agent.',
  "Promotion moves a fact into the agent's standing instructions.",
  'Keep only durable, canonical, stable knowledge: user preferences, project conventions, long-lived environment facts.',
  'Reject transient status, session-specific details, one-off events, and candidates that duplicate each other in spirit.',
  'Reply with the numbers of the candidates worth promoting (for example: 1,3).',
  'If none qualify, reply: none',
].join('\n');

export function triagePrompt(candidates: PromoteCandidate[]): string {
  const lines = candidates.map(
    (candidate, index) => `${index + 1}. [${candidate.id}] ${candidate.text}`,
  );
  return `${PROMOTE_TRIAGE_RUBRIC}\n\nCandidates:\n${lines.join('\n')}`;
}

const INDEX_PATTERN = /(?<![\w.-])\d+(?![\w-])/g;
const NONE_VERDICT = /^\s*(?:none|nothing|no candidates|n\/a)\s*[.!]?\s*$/i;

export function parseTriageVerdict(raw: string, candidateIds: string[]): string[] | undefined {
  if (NONE_VERDICT.test(raw)) {
    return [];
  }
  const tokens = raw.match(INDEX_PATTERN);
  if (tokens === null) {
    return undefined;
  }
  const picked = new Set(tokens.map((token) => Number.parseInt(token, 10) - 1));
  return candidateIds.filter((_, index) => picked.has(index));
}

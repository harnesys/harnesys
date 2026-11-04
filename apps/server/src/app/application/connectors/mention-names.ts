import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import { mentionSlug } from '../../domain/thread/responder-policy.ts';

export function assertUniqueMentionNames(agents: Array<{ id: string; name: string }>): void {
  const seen = new Map<string, { id: string; name: string }>();
  for (const agent of agents) {
    for (const alias of aliasesOf(agent.name)) {
      const other = seen.get(alias);
      if (other && other.id !== agent.id) {
        throw new ConnectorValidationException(
          `Two agents in this thread have the same mention name: ${other.name} and ${agent.name}`,
        );
      }
      seen.set(alias, agent);
    }
  }
}

function aliasesOf(name: string): string[] {
  const aliases = new Set<string>();
  const lower = name.trim().toLowerCase();
  if (lower) {
    aliases.add(lower);
  }
  const slug = mentionSlug(name);
  if (slug) {
    aliases.add(slug);
  }
  return [...aliases];
}

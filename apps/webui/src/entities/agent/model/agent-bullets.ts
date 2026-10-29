import type { Agent } from './agent';

const AGENT_BULLETS_PREFIX = 'harnesys.agent.bullets.';
const AGENT_BULLETS_LIMIT = 8;

type AgentRef = Pick<Agent, 'orgId' | 'id'>;

function bulletKey(agent: AgentRef): string {
  return `${AGENT_BULLETS_PREFIX}${agent.orgId}.${agent.id}`;
}

export function loadStoredAgentBullets(agent: AgentRef): string[] | null {
  try {
    const raw = localStorage.getItem(bulletKey(agent));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  } catch {
    return null;
  }
}

export function writeAgentBullets(agent: AgentRef, bullets: string[]): string[] {
  const next = bullets.slice(0, AGENT_BULLETS_LIMIT);
  try {
    localStorage.setItem(bulletKey(agent), JSON.stringify(next));
  } catch {}
  return next;
}

export function saveAgentBullet(agent: AgentRef, text: string): string[] {
  const bullet = text.trim();
  if (!bullet) {
    return loadStoredAgentBullets(agent) ?? [];
  }
  const previous = loadStoredAgentBullets(agent) ?? [];
  return writeAgentBullets(agent, [bullet, ...previous.filter((item) => item !== bullet)]);
}

import type { Agent } from '@/entities/agent';
import {
  ASSISTANT_FALLBACK_STARTERS,
  CHECKLIST_STARTERS,
} from '@/features/onboarding/model/onboarding-copy';
import type { OnboardingChecklist } from '@/features/onboarding/model/onboarding-progress';
import { useOnboardingProgress } from '@/features/onboarding/model/use-onboarding-progress';
import {
  CategoryLanding,
  CategoryLandingDescription,
  CategoryLandingEyebrow,
  CategoryLandingTitle,
} from '@/shared/ui/category-landing';
import { AgentBulletList } from './agent-bullet-list';

const MAX_STARTERS = 3;
const ASSISTANT_DESCRIPTION =
  'Ask me anything about Harnesys. I can walk you through agents, projects, automations and settings, and help you set things up.';

export function AssistantEmptyThread({ agent, threadId }: { agent: Agent; threadId: string }) {
  const { ready, checklist } = useOnboardingProgress(agent.orgId);
  const starters = ready ? onboardingStarters(checklist) : ASSISTANT_FALLBACK_STARTERS;
  return (
    <CategoryLanding data-testid="chat-empty-thread" className="fade-in animate-in duration-200">
      <CategoryLandingEyebrow>ASSISTANT</CategoryLandingEyebrow>
      <CategoryLandingTitle>{agent.name} can help</CategoryLandingTitle>
      <CategoryLandingDescription>{ASSISTANT_DESCRIPTION}</CategoryLandingDescription>
      <div className="mt-8">
        <AgentBulletList
          key={`${agent.id}:${starters.join('|')}`}
          agent={agent}
          threadId={threadId}
          starters={starters}
          editable={false}
        />
      </div>
    </CategoryLanding>
  );
}

function onboardingStarters(checklist: OnboardingChecklist): string[] {
  const pending = checklist.items
    .filter((item) => !item.done)
    .map((item) => CHECKLIST_STARTERS[item.key])
    .slice(0, MAX_STARTERS);
  if (pending.length === 0) {
    return [...ASSISTANT_FALLBACK_STARTERS];
  }
  const fillers = ASSISTANT_FALLBACK_STARTERS.filter((starter) => !pending.includes(starter));
  return [...pending, ...fillers].slice(0, MAX_STARTERS);
}

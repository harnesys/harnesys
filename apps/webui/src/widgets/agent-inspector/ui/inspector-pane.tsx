import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useDesk, useSelectedThread, useThreadEvents, useThreadWaiting } from '@/features/desk';
import { InspectorSummary } from './inspector-summary';
import { McpInspector } from './mcp-inspector';
import { ModelSection } from './model-section';
import { PlanInspector } from './plan-inspector';
import { Section } from './section';
import { SkillsInspector } from './skills-inspector';

export function InspectorPane({ agent }: { agent: Agent }) {
  const { project } = useDesk();
  const thread = useSelectedThread();
  const events = useThreadEvents(thread?.id ?? null);
  const streaming = useSessionStore(
    (state) => thread !== null && Boolean(state.activeRuns[thread.id]),
  );
  const waiting = useThreadWaiting(thread?.id ?? null);
  return (
    <>
      <InspectorSummary
        agent={agent}
        thread={thread}
        entries={events.length}
        streaming={streaming}
        waiting={waiting}
      />

      <PlanInspector />
      <ModelSection agent={agent} />
      <SkillsInspector agent={agent} />
      <McpInspector agent={agent} />

      {agent.instructions.trim() ? (
        <Section label="Instructions">
          <p className="line-clamp-6 whitespace-pre-wrap text-[12px] text-foreground/90 leading-relaxed">
            {agent.instructions}
          </p>
        </Section>
      ) : null}

      {project ? (
        <Section label="Project">
          <div className="flex flex-col gap-0.5">
            <p className="truncate font-medium text-[12px]">{project.name}</p>
            <p
              className="break-all font-mono text-[10px] text-muted-foreground leading-snug"
              title={project.path}
            >
              {project.path}
            </p>
          </div>
        </Section>
      ) : null}
    </>
  );
}

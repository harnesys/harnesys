import { Pane } from '@/shared/ui/capability-rows';
import { MemoryBackgroundSection, MemoryEmbeddingsSection } from './memory-embeddings-section';
import {
  MemoryConsolidationSection,
  MemoryPromoteSection,
  MemoryReadingSection,
  MemoryReflectSection,
  MemoryRelevanceSection,
  MemoryRemindersSection,
} from './memory-policy-sections';
import { MemoryPromotionsSection } from './memory-promotions-section';

export function AgentMemoryPolicyPane({
  value,
  onChange,
  embeddingsAvailable,
  orgId,
  agentId,
}: {
  value: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown>) => void;
  embeddingsAvailable: boolean | null;
  orgId: string;
  agentId: string | null;
}) {
  const policy = value ?? {};
  function patch(partial: Record<string, unknown>) {
    const next = { ...policy };
    for (const [key, nextValue] of Object.entries(partial)) {
      if (nextValue === undefined) {
        delete next[key];
      } else {
        next[key] = nextValue;
      }
    }
    onChange(next);
  }
  const gated = embeddingsAvailable === false;
  return (
    <Pane
      testId="agent-memory-policy-pane"
      label="Memory"
      description="Agent memory policy for this agent."
    >
      <div className="flex flex-col gap-5">
        <MemoryEmbeddingsSection orgId={orgId} />
        <MemoryBackgroundSection orgId={orgId} />
        <MemoryReadingSection policy={policy} patch={patch} disabled={gated} />
        <MemoryRelevanceSection policy={policy} patch={patch} disabled={gated} />
        <MemoryConsolidationSection policy={policy} patch={patch} />
        <MemoryRemindersSection policy={policy} patch={patch} />
        <MemoryReflectSection policy={policy} patch={patch} />
        <MemoryPromoteSection policy={policy} patch={patch} />
        <MemoryPromotionsSection orgId={orgId} agentId={agentId} />
      </div>
    </Pane>
  );
}

import type { Effort, ProviderPublic } from '@harnesys/studio-shared';
import { ArrowUpIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { ModelSelect } from '@/features/manage-agent';
import type { PendingHitl } from '@/features/send-message';
import { cancelRun } from '@/shared/api';
import { findModelLabel } from '@/shared/lib/model-label';
import { Button } from '@/shared/ui/button';
import type { ComposerUsage } from '../model/composer-context';
import { switchComposerModel } from '../model/switch-composer-model';
import { ContextRing } from './context-ring';
import { EffortSelect } from './effort-select';
import { UnverifiedModelCard } from './unverified-model-card';

export interface ComposerTrailingControlsProps {
  usage: ComposerUsage;
  contextWindow: number;
  agentReady: boolean;
  modelId: string | null;
  disabled: boolean;
  orgId: string | null | undefined;
  agent: Agent | null | undefined;
  hasEvents: boolean;
  providers: ProviderPublic[];
  currentEffort: Effort | undefined;
  levels: Effort[];
  onEffortChange: (value: Effort) => void;
  verified: boolean;
  modelIncomplete: boolean;
  streaming: boolean;
  canSend: boolean;
  hitl: PendingHitl | null;
  threadId: string | null;
  activeRunId: string | null;
  onSubmit: () => void;
  children?: ReactNode;
}

export function ComposerTrailingControls({
  usage,
  contextWindow,
  agentReady,
  modelId,
  disabled,
  orgId,
  agent,
  hasEvents,
  providers,
  currentEffort,
  levels,
  onEffortChange,
  verified,
  modelIncomplete,
  streaming,
  canSend,
  hitl,
  threadId,
  activeRunId,
  onSubmit,
  children,
}: ComposerTrailingControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ContextRing
        last={usage.last}
        run={usage.run}
        thread={usage.thread}
        stats={usage.stats}
        window={contextWindow}
        disabled={!agentReady}
      />
      <ModelSelect
        value={modelId}
        disabled={disabled || !agent || !orgId}
        size="sm"
        triggerClassName="h-7 max-w-44 border-0 bg-transparent px-1.5 font-mono text-[11px] shadow-none"
        onChange={(next) => {
          if (!agent || !orgId || !next) {
            return;
          }
          switchComposerModel({
            agent,
            orgId,
            nextModelId: next,
            hasEvents,
            providers,
          });
        }}
      />
      {currentEffort ? (
        <EffortSelect
          levels={levels}
          value={currentEffort}
          disabled={disabled}
          onChange={onEffortChange}
        />
      ) : null}
      {verified ? null : (
        <UnverifiedModelCard modelName={findModelLabel(modelId, providers)}>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center text-status-warn transition-colors hover:text-status-warn/75 focus-visible:outline-none"
            data-testid="model-unverified"
          >
            <TriangleAlertIcon className="size-3.5" />
          </button>
        </UnverifiedModelCard>
      )}
      {modelIncomplete ? (
        <UnverifiedModelCard
          modelName={findModelLabel(modelId, providers)}
          title="No context window"
          description="This model has no context window set. Set it in project settings before running — the run will be rejected without it."
          limitations={['The agent cannot track context usage or compact safely']}
          footer="Sending is disabled for this model"
        >
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center text-destructive transition-colors hover:text-destructive/75 focus-visible:outline-none"
            data-testid="model-no-window"
          >
            <TriangleAlertIcon className="size-3.5" />
          </button>
        </UnverifiedModelCard>
      ) : null}
      {children}
      <ComposerSendStopButton
        streaming={streaming}
        disabled={disabled || modelIncomplete}
        canSend={canSend}
        hitl={hitl}
        threadId={threadId}
        activeRunId={activeRunId}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function ComposerSendStopButton({
  streaming,
  disabled,
  canSend,
  hitl,
  threadId,
  activeRunId,
  onSubmit,
}: {
  streaming: boolean;
  disabled: boolean;
  canSend: boolean;
  hitl: PendingHitl | null;
  threadId: string | null;
  activeRunId: string | null;
  onSubmit: () => void;
}) {
  if (streaming) {
    return (
      <Button
        size="icon-xs"
        variant="destructive"
        className="rounded-full"
        onClick={() => {
          if (!threadId) {
            return;
          }
          useSessionStore.getState().abortRun(threadId);
          if (activeRunId) {
            void cancelRun(threadId, activeRunId).catch(() => {});
          }
        }}
        title="Stop generation"
      >
        <SquareIcon className="size-3 fill-current" />
        <span className="sr-only">Stop</span>
      </Button>
    );
  }
  return (
    <Button
      size="icon-xs"
      disabled={disabled || !canSend}
      onClick={onSubmit}
      title={hitl ? 'Answer the agent question' : undefined}
    >
      <ArrowUpIcon />
      <span className="sr-only">Send</span>
    </Button>
  );
}

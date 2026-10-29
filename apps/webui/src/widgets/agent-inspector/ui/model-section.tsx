import { useQuery } from '@tanstack/react-query';
import { type Agent, findModelLabel, formatContextWindow } from '@/entities/agent';
import { providersQuery } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { formatPricePer1M } from '@/shared/lib/format-price';
import { FactRow } from './fact-row';
import { Section } from './section';

export function ModelSection({ agent }: { agent: Agent }) {
  const providers = useQuery(providersQuery(getActiveOrgId() ?? '')).data ?? [];
  const modelLabel = findModelLabel(agent.modelId, providers);
  const model = providers
    .flatMap((provider) =>
      provider.models.map((entry) => ({ ...entry, providerName: provider.name })),
    )
    .find((entry) => entry.id === agent.modelId);
  return (
    <Section label="Model">
      {model ? (
        <div className="flex flex-col gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-[13px] leading-tight">{model.name}</p>
            <p className="truncate text-[11px] text-muted-foreground leading-tight">
              {model.providerName}
              {model.kind ? ` · ${model.kind}` : ''}
            </p>
          </div>

          <div className="flex flex-col">
            {model.contextWindow ? (
              <FactRow label="Context" mono>
                {formatContextWindow(model.contextWindow)}
              </FactRow>
            ) : null}
            {model.top_provider?.max_completion_tokens ? (
              <FactRow label="Max out" mono>
                {formatContextWindow(model.top_provider.max_completion_tokens)}
              </FactRow>
            ) : null}
            {model.pricing?.prompt !== undefined ? (
              <FactRow label="In $/1M" mono>
                {formatPricePer1M(model.pricing.prompt)}
              </FactRow>
            ) : null}
            {model.pricing?.completion !== undefined ? (
              <FactRow label="Out $/1M" mono>
                {formatPricePer1M(model.pricing.completion)}
              </FactRow>
            ) : null}
          </div>

          {model.supported_parameters && model.supported_parameters.length > 0 ? (
            <p className="line-clamp-2 text-[10px] text-muted-foreground/80 leading-relaxed">
              {model.supported_parameters.join(' · ')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="truncate font-mono text-[12px] text-muted-foreground">
            {modelLabel || agent.modelId || 'No model assigned'}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Assign a model in the agent settings to chat.
          </p>
        </div>
      )}
    </Section>
  );
}

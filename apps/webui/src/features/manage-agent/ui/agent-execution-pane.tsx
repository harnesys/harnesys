import { useQuery } from '@tanstack/react-query';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import type { Agent } from '@/entities/agent';
import { executionProfilesQuery, LOCAL_EXECUTION_PROFILE_ID } from '@/shared/api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsForm = UseFormReturn<AgentFieldsInput, unknown, AgentFieldsOutput>;

interface AgentExecutionPaneProps {
  form: AgentFieldsForm;
  activeAgent: Agent | null;
}

export function AgentExecutionPane({ form, activeAgent }: AgentExecutionPaneProps) {
  const orgId = getActiveOrgId() ?? activeAgent?.orgId ?? '';
  const { data: profiles } = useQuery(executionProfilesQuery(orgId));
  const overrideProfileId = useWatch({ control: form.control, name: 'executionProfileId' });
  const defaultProfileId = profiles?.defaultProfileId ?? null;
  const ownProfileId = overrideProfileId ?? null;
  const effectiveProfileId = ownProfileId ?? defaultProfileId;
  const effectiveProfile = profiles?.items.find((item) => item.id === effectiveProfileId);
  const selectedBy = ownProfileId ? 'agent' : 'organization';

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm">
        <p className="text-muted-foreground">Effective execution profile</p>
        <p className="font-medium">{effectiveProfile?.name ?? '—'}</p>
        <p className="text-muted-foreground text-xs">
          {selectedBy === 'agent'
            ? 'Selected by this agent'
            : `Inherited from organization${defaultProfileId ? '' : ' (none set)'}`}
        </p>
        {effectiveProfile ? (
          <p className="text-muted-foreground text-xs">
            {effectiveProfile.isolation === 'container' ? 'Container' : 'Host'} isolation ·{' '}
            {effectiveProfile.nodeIds.length}{' '}
            {effectiveProfile.nodeIds.length === 1 ? 'host' : 'hosts'} in profile
          </p>
        ) : null}
      </div>
      <Controller
        control={form.control}
        name="executionProfileId"
        render={({ field }) => (
          <Field>
            <FieldLabel>Agent profile override</FieldLabel>
            <Select
              value={field.value ?? ''}
              onValueChange={(value) => field.onChange(value || null)}
            >
              <SelectTrigger data-testid="agent-execution-profile">
                <SelectValue placeholder="Inherit from organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Inherit from organization</SelectItem>
                {profiles?.items.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                    {profile.isDefault ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      {effectiveProfileId === LOCAL_EXECUTION_PROFILE_ID && (
        <p className="text-muted-foreground text-xs">
          Local profile runs only on the relay. A file rule pinned to another node needs a profile
          that includes it.
        </p>
      )}
    </div>
  );
}

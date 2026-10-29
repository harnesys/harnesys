import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { orgSettingsQuery, orgSettingsQueryKey, patchOrgSettings } from '@/shared/api/org-skills';
import { timeZoneOptions } from '@/shared/lib/time-zone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsField, SettingsSection } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

const TIME_ZONES = timeZoneOptions();

export function OrgTimezoneSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(orgSettingsQuery(orgId));
  const [pending, setPending] = useState<string | null>(null);
  const current = pending ?? settingsQuery.data?.timezone ?? 'UTC';
  const zones = TIME_ZONES.includes(current) ? TIME_ZONES : [current, ...TIME_ZONES];
  const save = useMutation({
    mutationFn: (timezone: string) => patchOrgSettings(orgId, { timezone }),
    onSuccess: (result) => {
      queryClient.setQueryData(orgSettingsQueryKey(orgId), result);
      setPending(null);
      toast.add({ title: 'Time zone saved', description: result.timezone });
    },
    onError: (error: unknown) => {
      setPending(null);
      toast.add({
        title: error instanceof Error ? error.message : 'Could not save time zone',
      });
    },
  });
  return (
    <SettingsSection
      label="Time zone"
      description="Day boundary for the agent daily budget and the usage report."
      testId="org-general-timezone"
    >
      <SettingsField
        label="Time zone"
        description="IANA zone, e.g. Europe/Moscow. It defines the end of the agent daily budget day."
      >
        <Select
          value={current}
          onValueChange={(value) => {
            if (!value || value === current) {
              return;
            }
            setPending(value);
            save.mutate(value);
          }}
          disabled={save.isPending}
        >
          <SelectTrigger
            id="org-general-timezone"
            className="w-full"
            size="sm"
            data-testid="org-general-timezone-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
    </SettingsSection>
  );
}

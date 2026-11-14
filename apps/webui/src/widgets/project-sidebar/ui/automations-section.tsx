import { ZapIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { Agent } from '@/entities/agent';
import { isCoreAutomation } from '@/entities/automation';
import { useAutomationsInProjects } from '@/features/desk';
import { useAutomationConfig } from '@/features/manage-automations';
import { findIntegrationUi } from '@/integrations/registry';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import {
  AutomationsSectionCreateButton,
  useCreateAutomation,
} from './automation-create-picker-dialog';
import { AutomationRow } from './automation-row';
import { SidebarEmpty } from './sidebar-empty';

export const AutomationsSectionActions = AutomationsSectionCreateButton;

export interface AutomationsSectionProps {
  agents: Agent[];
  onSelectDone: () => void;
}

export function AutomationsSection({ agents, onSelectDone }: AutomationsSectionProps) {
  const orgId = useOrgId() ?? '';
  const automations = useAutomationsInProjects(orgId ? [orgId] : []);
  const { openThread } = useStudioNavigation();
  const configure = useAutomationConfig();
  const createAutomation = useCreateAutomation(agents, onSelectDone);
  const entries = automations.filter((item) => !isCoreAutomation(item));
  if (entries.length === 0) {
    return (
      <SidebarEmpty
        title="No automations yet"
        onAction={createAutomation}
        testId="automations-empty"
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
      {entries.map((item) => (
        <Fragment key={`${item.integrationId}:${item.kind}:${item.id}`}>
          <AutomationRow
            automation={item}
            icon={findIntegrationUi(item.integrationId)?.icon ?? ZapIcon}
            selected={false}
            onSelect={() => {
              if (!item.threadId) {
                return;
              }
              openThread(item.projectId, item.threadId);
              onSelectDone();
            }}
            onSettings={() => {
              void configure({
                integrationId: item.integrationId,
                kind: item.kind,
                source: item.source,
                scopeId: orgId,
                agents,
                automation: item,
              });
            }}
          />
        </Fragment>
      ))}
    </div>
  );
}

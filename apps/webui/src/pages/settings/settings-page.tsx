import { ArrowLeftIcon } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { UpdatePane } from '@/features/app-update';
import { AppearancePane } from '@/features/appearance/appearance-pane';
import { AccountPane } from '@/features/manage-account';
import { OrgAuditPane } from '@/features/manage-audit';
import { ChatSettingsPane } from '@/features/manage-chat-settings/ui/chat-settings-pane';
import { ConnectorsPane } from '@/features/manage-connectors';
import { EditorSettingsPane } from '@/features/manage-editor-settings/ui/editor-settings-pane';
import { FleetPage } from '@/features/manage-fleet/fleet-page';
import { ProfilesPane } from '@/features/manage-fleet/profiles-pane';
import { OrgMembersPane } from '@/features/manage-members';
import { NotificationSettingsPane } from '@/features/manage-notification-settings/ui/notification-settings-pane';
import { OrgBrowserPane } from '@/features/manage-org-browser/org-browser-pane';
import { OrgGeneralPane } from '@/features/manage-org-general/org-general-pane';
import { OrgLspPane } from '@/features/manage-org-lsp/org-lsp-pane';
import { OrgMcpPane } from '@/features/manage-org-mcp/org-mcp-pane';
import { OrgModePresetsPane } from '@/features/manage-org-mode-presets/org-mode-presets-pane';
import { OrgPackagesPane } from '@/features/manage-org-packages/org-packages-pane';
import { OrgPluginsPane } from '@/features/manage-org-plugins/org-plugins-pane';
import { OrgSkillsPane } from '@/features/manage-org-skills/org-skills-pane';
import { ModelsPane } from '@/features/manage-project-settings/ui/models-pane';
import { UsagePane } from '@/features/manage-usage';
import { VaultPane } from '@/features/manage-vault/vault-pane';
import {
  parseWindowSettingsCategory,
  studioPath,
  type WindowSettingsCategory,
} from '@/shared/config/routes';
import { findSettingsItem, WINDOW_SETTINGS_GROUPS } from '@/shared/config/settings-nav';
import { SettingsNav } from '@/widgets/settings-nav/settings-nav';

export function SettingsPage() {
  const { orgId, category } = useParams();
  const navigate = useNavigate();
  const active = parseWindowSettingsCategory(category);
  const meta = findSettingsItem(active);

  if (!orgId) {
    return null;
  }

  return (
    <div
      className="flex h-svh min-h-0 w-full flex-col bg-background md:flex-row"
      data-testid="settings-page"
    >
      <aside className="flex w-full shrink-0 flex-col border-b bg-sidebar md:h-full md:w-56 md:border-r md:border-b-0">
        <div className="flex h-12 items-center px-2">
          <Link
            to={studioPath.desk(orgId)}
            data-testid="settings-back"
            className="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-muted-foreground text-sm transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          >
            <ArrowLeftIcon className="size-3.5 shrink-0" />
            Back to desk
          </Link>
        </div>
        <div className="min-h-0 flex-1">
          <SettingsNav
            groups={WINDOW_SETTINGS_GROUPS}
            active={active}
            onSelect={(next) => {
              void navigate(studioPath.settings(orgId, parseWindowSettingsCategory(next)));
            }}
          />
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-6 md:px-8">
          <h1 className="truncate font-medium text-sm">{meta?.label ?? active}</h1>
          {meta?.description ? (
            <p className="hidden truncate text-muted-foreground text-xs md:block">
              {meta.description}
            </p>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8"
            data-testid={`settings-pane-${active}`}
          >
            <SettingsPane category={active} orgId={orgId} />
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingsPane({ category, orgId }: { category: WindowSettingsCategory; orgId: string }) {
  switch (category) {
    case 'appearance':
      return <AppearancePane />;
    case 'chat':
      return <ChatSettingsPane />;
    case 'editor':
      return <EditorSettingsPane />;
    case 'notifications':
      return <NotificationSettingsPane />;
    case 'general':
      return <OrgGeneralPane key={orgId} orgId={orgId} />;
    case 'members':
      return <OrgMembersPane key={orgId} orgId={orgId} />;
    case 'fleet':
      return <FleetPage orgId={orgId} />;
    case 'profiles':
      return <ProfilesPane orgId={orgId} />;
    case 'browser':
      return <OrgBrowserPane orgId={orgId} />;
    case 'skills':
      return <OrgSkillsPane orgId={orgId} />;
    case 'mcp':
      return <OrgMcpPane orgId={orgId} />;
    case 'modes':
      return <OrgModePresetsPane orgId={orgId} />;
    case 'plugins':
      return <OrgPluginsPane orgId={orgId} />;
    case 'packages':
      return <OrgPackagesPane orgId={orgId} />;
    case 'lsp':
      return <OrgLspPane orgId={orgId} />;
    case 'providers':
      return <ModelsPane orgId={orgId} />;
    case 'connectors':
      return <ConnectorsPane orgId={orgId} />;
    case 'secrets':
      return <VaultPane orgId={orgId} />;
    case 'usage':
      return <UsagePane orgId={orgId} />;
    case 'account':
      return <AccountPane />;
    case 'audit':
      return <OrgAuditPane key={orgId} orgId={orgId} />;
    case 'updates':
      return <UpdatePane />;
  }
}

import { ArrowLeftIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  parseWindowSettingsCategory,
  studioPath,
  type WindowSettingsCategory,
} from '@/shared/config/routes';
import { findSettingsItem, WINDOW_SETTINGS_GROUPS } from '@/shared/config/settings-nav';
import { Spinner } from '@/shared/ui/spinner';
import { SettingsNav } from '@/widgets/settings-nav/settings-nav';

const AppearancePane = lazy(() =>
  import('@/features/appearance/appearance-pane').then((module) => ({
    default: module.AppearancePane,
  })),
);
const VcsPane = lazy(() =>
  import('@/features/manage-vcs/ui/vcs-pane').then((module) => ({ default: module.VcsPane })),
);
const ChatSettingsPane = lazy(() =>
  import('@/features/manage-chat-settings/ui/chat-settings-pane').then((module) => ({
    default: module.ChatSettingsPane,
  })),
);
const EditorSettingsPane = lazy(() =>
  import('@/features/manage-editor-settings/ui/editor-settings-pane').then((module) => ({
    default: module.EditorSettingsPane,
  })),
);
const NotificationSettingsPane = lazy(() =>
  import('@/features/manage-notification-settings/ui/notification-settings-pane').then(
    (module) => ({
      default: module.NotificationSettingsPane,
    }),
  ),
);
const OrgGeneralPane = lazy(() =>
  import('@/features/manage-org-general/org-general-pane').then((module) => ({
    default: module.OrgGeneralPane,
  })),
);
const OrgMembersPane = lazy(() =>
  import('@/features/manage-members').then((module) => ({ default: module.OrgMembersPane })),
);
const FleetPage = lazy(() =>
  import('@/features/manage-fleet/fleet-page').then((module) => ({ default: module.FleetPage })),
);
const ProfilesPane = lazy(() =>
  import('@/features/manage-fleet/profiles-pane').then((module) => ({
    default: module.ProfilesPane,
  })),
);
const OrgBrowserPane = lazy(() =>
  import('@/features/manage-org-browser/org-browser-pane').then((module) => ({
    default: module.OrgBrowserPane,
  })),
);
const OrgSkillsPane = lazy(() =>
  import('@/features/manage-org-skills/org-skills-pane').then((module) => ({
    default: module.OrgSkillsPane,
  })),
);
const OrgMcpPane = lazy(() =>
  import('@/features/manage-org-mcp/org-mcp-pane').then((module) => ({
    default: module.OrgMcpPane,
  })),
);
const OrgModePresetsPane = lazy(() =>
  import('@/features/manage-org-mode-presets/org-mode-presets-pane').then((module) => ({
    default: module.OrgModePresetsPane,
  })),
);
const OrgPluginsPane = lazy(() =>
  import('@/features/manage-org-plugins/org-plugins-pane').then((module) => ({
    default: module.OrgPluginsPane,
  })),
);
const OrgPackagesPane = lazy(() =>
  import('@/features/manage-org-packages/org-packages-pane').then((module) => ({
    default: module.OrgPackagesPane,
  })),
);
const OrgLspPane = lazy(() =>
  import('@/features/manage-org-lsp/org-lsp-pane').then((module) => ({
    default: module.OrgLspPane,
  })),
);
const OrgToolchainPane = lazy(() =>
  import('@/features/manage-org-toolchain/org-toolchain-pane').then((module) => ({
    default: module.OrgToolchainPane,
  })),
);
const ManageAddonsPane = lazy(() =>
  import('@/features/manage-addons/manage-addons-pane').then((module) => ({
    default: module.ManageAddonsPane,
  })),
);
const AppsPane = lazy(() =>
  import('@/features/manage-apps/apps-pane').then((module) => ({ default: module.AppsPane })),
);
const ModelsPane = lazy(() =>
  import('@/features/manage-project-settings/ui/models-pane').then((module) => ({
    default: module.ModelsPane,
  })),
);
const VaultPane = lazy(() =>
  import('@/features/manage-vault/vault-pane').then((module) => ({ default: module.VaultPane })),
);
const UsagePane = lazy(() =>
  import('@/features/manage-usage').then((module) => ({ default: module.UsagePane })),
);
const AccountPane = lazy(() =>
  import('@/features/manage-account').then((module) => ({ default: module.AccountPane })),
);
const OrgAuditPane = lazy(() =>
  import('@/features/manage-audit').then((module) => ({ default: module.OrgAuditPane })),
);
const UpdatePane = lazy(() =>
  import('@/features/app-update').then((module) => ({ default: module.UpdatePane })),
);
const SupportPane = lazy(() =>
  import('@/features/support/ui/support-pane').then((module) => ({ default: module.SupportPane })),
);

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
            <Suspense fallback={<Spinner className="mx-auto my-12 size-5" />}>
              <SettingsPane category={active} orgId={orgId} />
            </Suspense>
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
    case 'vcs':
      return <VcsPane key={orgId} orgId={orgId} />;
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
    case 'toolchain':
      return <OrgToolchainPane orgId={orgId} />;
    case 'addons':
      return <ManageAddonsPane key={orgId} orgId={orgId} />;
    case 'apps':
      return <AppsPane key={orgId} orgId={orgId} />;
    case 'providers':
      return <ModelsPane orgId={orgId} />;
    case 'secrets':
      return <VaultPane key={orgId} orgId={orgId} />;
    case 'usage':
      return <UsagePane orgId={orgId} />;
    case 'account':
      return <AccountPane />;
    case 'audit':
      return <OrgAuditPane key={orgId} orgId={orgId} />;
    case 'updates':
      return <UpdatePane />;
    case 'support':
      return <SupportPane />;
  }
}

import { lazy, type ReactNode, Suspense } from 'react';
import { Navigate, Outlet, type RouteObject, useParams } from 'react-router';
import { DeskSync, OrgDeskSync } from '@/features/desk';
import { OrgBootstrap } from '@/features/switch-org/org-bootstrap';
import { useOrgStore } from '@/features/switch-org/org-context';
import { OrgScopeSync } from '@/features/switch-org/org-scope-sync';
import { OrgTimeZoneProvider } from '@/features/switch-org/org-time-zone';
import { ProjectPage } from '@/pages/project';
import { useOrgId } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { OverlayProvider } from '@/shared/services/overlay';
import { Spinner } from '@/shared/ui/spinner';
import { AssistantChat } from '@/widgets/assistant-chat';

const AcceptInvitePage = lazy(() =>
  import('@/pages/accept-invite').then((module) => ({ default: module.AcceptInvitePage })),
);
const InboxPage = lazy(() =>
  import('@/pages/inbox').then((module) => ({ default: module.InboxPage })),
);
const OnboardingChoosePage = lazy(() =>
  import('@/pages/onboarding').then((module) => ({ default: module.OnboardingChoosePage })),
);
const OnboardingCreatePage = lazy(() =>
  import('@/pages/onboarding').then((module) => ({ default: module.OnboardingCreatePage })),
);
const OnboardingJoinPage = lazy(() =>
  import('@/pages/onboarding').then((module) => ({ default: module.OnboardingJoinPage })),
);
const OnboardingModelsPage = lazy(() =>
  import('@/pages/onboarding').then((module) => ({ default: module.OnboardingModelsPage })),
);
const OnboardingPresetsPage = lazy(() =>
  import('@/pages/onboarding').then((module) => ({ default: module.OnboardingPresetsPage })),
);
const OnboardingProviderPage = lazy(() =>
  import('@/pages/onboarding').then((module) => ({ default: module.OnboardingProviderPage })),
);
const ScrollProbePage = lazy(() =>
  import('@/pages/scroll-probe').then((module) => ({ default: module.ScrollProbePage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/settings/settings-page').then((module) => ({ default: module.SettingsPage })),
);
const SignInPage = lazy(() =>
  import('@/pages/sign-in').then((module) => ({ default: module.SignInPage })),
);
const SignUpPage = lazy(() =>
  import('@/pages/sign-up').then((module) => ({ default: module.SignUpPage })),
);
const AddonDetailPage = lazy(() =>
  import('@/features/manage-addons/addon-detail-page').then((module) => ({
    default: module.AddonDetailPage,
  })),
);
const AppProviderPage = lazy(() =>
  import('@/features/manage-apps/ui/provider-page').then((module) => ({
    default: module.AppProviderPage,
  })),
);
const WorkerRelayPage = lazy(() =>
  import('@/features/relay-link').then((module) => ({ default: module.WorkerRelayPage })),
);

function RouteFallback() {
  return (
    <div className="flex h-dvh w-full items-center justify-center text-muted-foreground">
      <Spinner className="size-5" />
    </div>
  );
}

function AppFrame() {
  const orgId = useOrgId();
  return (
    <OrgTimeZoneProvider orgId={orgId}>
      <OverlayProvider />
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </OrgTimeZoneProvider>
  );
}

function RootGate() {
  const { ready, orgs, activeOrgId } = useOrgStore();
  if (!ready) {
    return null;
  }
  if (orgs.length === 0) {
    return null;
  }
  const active = orgs.find((row) => row.orgId === activeOrgId) ?? null;
  if (active?.role === 'worker') {
    return <Navigate to="/worker" replace />;
  }
  const target =
    activeOrgId && orgs.some((row) => row.orgId === activeOrgId)
      ? activeOrgId
      : (orgs.find((row) => row.role !== 'worker')?.orgId ?? null);
  if (!target) {
    return <Navigate to="/worker" replace />;
  }
  return <Navigate to={studioPath.desk(target)} replace />;
}

function WorkerOrgShade({ children }: { children: ReactNode }) {
  const { orgId } = useParams();
  const { orgs } = useOrgStore();
  const entry = orgId ? orgs.find((row) => row.orgId === orgId) : null;
  if (entry?.role === 'worker') {
    return <WorkerRelayPage />;
  }
  return <>{children}</>;
}

function SettingsIndexRedirect() {
  const { orgId } = useParams();
  if (!orgId) {
    return <Navigate to="/" replace />;
  }
  return <Navigate to={studioPath.settings(orgId, 'appearance')} replace />;
}

function BareProjectRedirect() {
  const { orgId } = useParams();
  return <Navigate to={orgId ? studioPath.desk(orgId) : '/'} replace />;
}

function OrgLayout() {
  return (
    <WorkerOrgShade>
      <OrgBootstrap>
        <OrgScopeSync />
        <OrgDeskSync />
        <DeskSync />
        <Outlet />
        <AssistantChat />
      </OrgBootstrap>
    </WorkerOrgShade>
  );
}

export const routes: RouteObject[] = [
  {
    element: <AppFrame />,
    children: [
      {
        path: '/',
        element: (
          <OrgBootstrap>
            <RootGate />
          </OrgBootstrap>
        ),
      },
      { path: 'create', element: <Navigate to="/onboarding/create" replace /> },
      { path: 'join', element: <Navigate to="/onboarding/join" replace /> },
      { path: 'login', element: <SignInPage /> },
      { path: 'signup', element: <SignUpPage /> },
      { path: 'accept', element: <AcceptInvitePage /> },
      { path: 'worker', element: <WorkerRelayPage /> },
      { path: 'onboarding', element: <Navigate to="choose" replace /> },
      { path: 'onboarding/choose', element: <OnboardingChoosePage /> },
      { path: 'onboarding/create', element: <OnboardingCreatePage /> },
      { path: 'onboarding/provider/:orgId', element: <OnboardingProviderPage /> },
      { path: 'onboarding/models/:orgId', element: <OnboardingModelsPage /> },
      { path: 'onboarding/presets/:orgId', element: <OnboardingPresetsPage /> },
      { path: 'onboarding/join', element: <OnboardingJoinPage /> },
      {
        path: 'o/:orgId',
        element: <OrgLayout />,
        children: [
          {
            path: 'fleet',
            element: <Navigate to="settings/fleet" replace />,
          },
          { path: 'settings', element: <SettingsIndexRedirect /> },
          { path: 'settings/:category', element: <SettingsPage /> },
          { path: 'settings/addons/:addonId', element: <AddonDetailPage /> },
          { path: 'settings/apps/:providerId', element: <AppProviderPage /> },
          { path: 'inbox', element: <InboxPage /> },
          {
            element: <ProjectPage />,
            children: [
              { index: true, element: null },
              { path: 'thread/:threadId', element: null },
              { path: 'board/:boardId', element: null },
              { path: 'dashboard/:dashboardId', element: null },
              { path: 'attachment/:issueId/:attachmentId', element: null },
              { path: 'spawn/:threadId/:spawnId', element: null },
              { path: 'terminal/:sessionId', element: null },
              {
                path: ':projectId',
                children: [
                  { index: true, element: <BareProjectRedirect /> },
                  { path: 'thread/:threadId', element: null },
                  { path: 'file/*', element: null },
                  { path: 'diff/*', element: null },
                  { path: 'spawn/:threadId/:spawnId', element: null },
                  { path: 'terminal/:sessionId', element: null },
                  { path: 'attachment/:issueId/:attachmentId', element: null },
                ],
              },
            ],
          },
        ],
      },
      { path: 'scroll-probe', element: <ScrollProbePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

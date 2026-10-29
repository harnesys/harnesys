import type { ReactNode } from 'react';
import { Navigate, Outlet, type RouteObject, useParams } from 'react-router';
import { DeskSync, OrgDeskSync } from '@/features/desk';
import { ConnectorDetailPage } from '@/features/manage-connectors';
import { WorkerRelayPage } from '@/features/relay-link';
import { OrgBootstrap } from '@/features/switch-org/org-bootstrap';
import { useOrgStore } from '@/features/switch-org/org-context';
import { OrgScopeSync } from '@/features/switch-org/org-scope-sync';
import { OrgTimeZoneProvider } from '@/features/switch-org/org-time-zone';
import { AcceptInvitePage } from '@/pages/accept-invite';
import { InboxPage } from '@/pages/inbox';
import { CreateOrgPage, JoinOrgPage } from '@/pages/org-setup';
import { ProjectPage } from '@/pages/project';
import { ScrollProbePage } from '@/pages/scroll-probe';
import { SettingsPage } from '@/pages/settings/settings-page';
import { SignInPage } from '@/pages/sign-in';
import { SignUpPage } from '@/pages/sign-up';
import { useOrgId } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { OverlayProvider } from '@/shared/services/overlay';

function AppFrame() {
  const orgId = useOrgId();
  return (
    <OrgTimeZoneProvider orgId={orgId}>
      <OverlayProvider />
      <Outlet />
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
      { path: 'create', element: <CreateOrgPage /> },
      { path: 'join', element: <JoinOrgPage /> },
      { path: 'login', element: <SignInPage /> },
      { path: 'signup', element: <SignUpPage /> },
      { path: 'accept', element: <AcceptInvitePage /> },
      { path: 'worker', element: <WorkerRelayPage /> },
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
          { path: 'settings/connectors/:connectorId', element: <ConnectorDetailPage /> },
          { path: 'inbox', element: <InboxPage /> },
          {
            element: <ProjectPage />,
            children: [
              { path: 'schedule/:scheduleId', element: null },
              { path: 'webhook/:webhookId', element: null },
              { path: 'spawn/:threadId/:spawnId', element: null },
              { path: 'terminal/:sessionId', element: null },
            ],
          },
          {
            element: <ProjectPage />,
            children: [
              { index: true, element: null },
              { path: 'thread/:threadId', element: null },
              { path: 'board/:boardId', element: null },
              { path: 'attachment/:issueId/:attachmentId', element: null },
              {
                path: ':projectId',
                children: [
                  { index: true, element: <BareProjectRedirect /> },
                  { path: 'thread/:threadId', element: null },
                  { path: 'file/*', element: null },
                  { path: 'diff/*', element: null },
                  { path: 'schedule/:scheduleId', element: null },
                  { path: 'webhook/:webhookId', element: null },
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

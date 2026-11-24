import { lazy, Suspense } from 'react';
import { openFileKind, useProjectOpenFiles } from '@/features/open-file';
import { getActiveOrgId } from '@/shared/api/active-org';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { Spinner } from '@/shared/ui/spinner';
import { useAddonViewer } from '../model/use-addon-viewer';
import { AddonViewerFrame } from './addon-viewer-frame';
import { MediaPreview } from './media-preview';
import { TextEditor } from './text-editor';

const DxfPreview = lazy(() =>
  import('./dxf-preview').then((module) => ({ default: module.DxfPreview })),
);

export function FilePane() {
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const { tabs, activePath } = useProjectOpenFiles(projectId);
  const active = tabs.find((tab) => tab.path === activePath) ?? null;
  const orgId = getActiveOrgId();
  const viewer = useAddonViewer(orgId, active?.path ?? '');
  if (!projectId || !active) {
    return null;
  }
  if (orgId && viewer) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="file-pane">
        <AddonViewerFrame
          key={active.path}
          orgId={orgId}
          projectId={projectId}
          path={active.path}
          viewer={viewer}
        />
      </section>
    );
  }
  const kind = openFileKind(active.path);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="file-pane">
      {kind === 'text' ? (
        <TextEditor projectId={projectId} path={active.path} dirty={active.dirty} />
      ) : null}
      {kind === 'image' || kind === 'pdf' || kind === 'csv' ? (
        <MediaPreview projectId={projectId} path={active.path} kind={kind} />
      ) : null}
      {kind === 'dxf' ? (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Spinner className="size-5" />
            </div>
          }
        >
          <DxfPreview projectId={projectId} path={active.path} />
        </Suspense>
      ) : null}
    </section>
  );
}

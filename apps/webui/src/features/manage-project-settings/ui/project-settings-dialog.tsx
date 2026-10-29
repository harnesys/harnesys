import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { projectQuery } from '@/shared/api';
import { type DialogComponentProps, dialog, patchOverlayOptions } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import type { ProjectSettingsCategory } from '../model/project-settings-nav.ts';
import { ProjectSettingsCategoryPanes } from './project-settings-category-panes.tsx';
import { ProjectSettingsNav } from './project-settings-nav.tsx';

const DIALOG_CLASS =
  'flex min-h-0 h-[min(78vh,48rem)] w-full max-w-4xl sm:max-w-4xl overflow-hidden';
export function openProjectSettingsDialog(projectId: string): Promise<void> {
  return dialog
    .open(ProjectSettingsDialog, {
      title: 'Source settings',
      className: DIALOG_CLASS,
      testId: 'project-settings-dialog',
      data: { projectId },
    })
    .then(() => undefined);
}
export function ProjectSettingsDialog({
  onResolve,
  data,
}: DialogComponentProps<
  void,
  {
    projectId: string;
  }
>) {
  const projectId = data?.projectId ?? '';
  const [category, setCategory] = useState<ProjectSettingsCategory>('general');
  const projects = useQuery(projectQuery).data ?? [];
  const project = projects.find((item) => item.id === projectId) ?? null;
  useEffect(() => {
    patchOverlayOptions({
      title: project ? `${project.name} · Source settings` : 'Source settings',
    });
  }, [project]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        <ProjectSettingsNav category={category} onSelect={setCategory} className="pr-1" />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {project ? (
            <p
              className="mb-2 truncate text-muted-foreground text-xs"
              data-testid="project-settings-node"
            >
              {project.driver ?? 'source'} · {project.name}
            </p>
          ) : null}
          <ProjectSettingsCategoryPanes
            category={category}
            projectId={projectId}
            onClose={() => onResolve?.()}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}

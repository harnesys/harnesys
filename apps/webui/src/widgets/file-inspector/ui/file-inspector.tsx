import { useQuery } from '@tanstack/react-query';
import { FileIcon } from 'lucide-react';
import { useProjects } from '@/entities/project';
import { getGitFileStatus, gitFileStatusQueryKey } from '@/shared/api/git';
import { detectLanguage } from '@/shared/lib/tool-code';
import { FileTypeIcon } from '@/shared/ui/icons';
import { ScrollArea } from '@/shared/ui/scroll-area';

interface FileTab {
  path: string;
  dirty?: boolean;
  projectId: string;
}
export function FileInspector({ width, file }: { width: number; file: FileTab }) {
  const projects = useProjects().data ?? [];
  const project = projects.find((row) => row.id === file.projectId);
  const mayHaveGit = project ? project.driver === 'host-bound' || project.hasGit : false;
  const gitQuery = useQuery({
    queryKey: gitFileStatusQueryKey(file.projectId),
    queryFn: () => getGitFileStatus(file.projectId),
    enabled: Boolean(file.projectId) && mayHaveGit,
  });
  const gitStatus = gitQuery.data?.map?.[file.path];
  const basename = file.path.split('/').pop() ?? file.path;
  const lang = detectLanguage(file.path);
  return (
    <aside
      className="flex h-svh shrink-0 flex-col self-stretch bg-background"
      style={{ width }}
      data-testid="file-inspector"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-3 py-3 pb-8">
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FileTypeIcon name={file.path} size="xl" />
              <span className="truncate font-medium text-sm">{basename}</span>
              {file.dirty ? (
                <span className="size-2 shrink-0 rounded-full bg-live" title="Unsaved" />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">
                {file.dirty ? 'Unsaved changes' : 'Saved'}
              </span>
              {gitStatus ? (
                <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">
                  git: {String(gitStatus).slice(0, 20)}
                </span>
              ) : (
                <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  git: —
                </span>
              )}
              {lang ? (
                <span className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px]">
                  {lang}
                </span>
              ) : null}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              Details
            </h3>
            <div className="rounded-lg border p-3 text-xs leading-relaxed">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileIcon className="size-3.5" />
                <span>File inspector</span>
              </div>
              <p className="pt-2 text-muted-foreground">Editing {basename}.</p>
              {project ? (
                <div className="pt-2 text-[11px] text-muted-foreground">
                  <p>Project: {project.name}</p>
                  <p className="truncate">Path: {project.path}</p>
                </div>
              ) : null}
              {gitQuery.data?.map ? (
                <div className="pt-2 text-[11px] text-muted-foreground">
                  <p>
                    Git: {Object.values(gitQuery.data.map).filter((s) => s !== 'ignored').length}{' '}
                    changed files
                    {gitQuery.data.truncated ? ' (truncated)' : ''}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

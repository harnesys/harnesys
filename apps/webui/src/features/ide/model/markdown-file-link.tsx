import { useQueryClient } from '@tanstack/react-query';
import type { Components } from 'react-markdown';
import { useNavigate } from 'react-router';
import { useProjects } from '@/entities/project';
import { getActiveOrgId } from '@/shared/api/active-org';
import { getSourceLocation, sourceLocationQueryKey } from '@/shared/api/source-location';
import { studioPath } from '@/shared/config/routes';
import { toast } from '@/shared/ui/toast';
import { useIdeStore } from './ide.store';

export function useFileLinkComponents(): Components {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useProjects().data ?? [];
  const components: Components = {
    a: ({ node, children, href, ...rest }) => (
      <a
        {...rest}
        href={href}
        onClick={(event) => {
          if (!intercepts(href)) {
            return;
          }
          event.preventDefault();
          void openHostFile(href ?? '');
        }}
      >
        {children}
      </a>
    ),
  };
  return components;

  function intercepts(href: string | undefined): boolean {
    return href !== undefined && hostPathOf(href) !== null;
  }

  async function openHostFile(href: string): Promise<void> {
    const abs = hostPathOf(href);
    const orgId = getActiveOrgId();
    if (!abs || !orgId) {
      return;
    }
    const match = await matchProjectRoot(abs);
    if (!match) {
      toast.add({ title: 'File is outside connected sources' });
      return;
    }
    useIdeStore.getState().openFile(match.projectId, match.relPath);
    void navigate(studioPath.file(orgId, match.projectId, match.relPath));
  }

  async function matchProjectRoot(
    abs: string,
  ): Promise<{ projectId: string; relPath: string } | null> {
    const located = await Promise.allSettled(
      projects.map(async (project) => ({
        projectId: project.id,
        root: (
          await queryClient.fetchQuery({
            queryKey: sourceLocationQueryKey(project.id),
            queryFn: () => getSourceLocation(project.id),
          })
        ).absoluteRoot,
      })),
    );
    let best: { projectId: string; root: string } | null = null;
    for (const item of located) {
      if (item.status !== 'fulfilled' || !insideRoot(abs, item.value.root)) {
        continue;
      }
      if (!best || item.value.root.length > best.root.length) {
        best = item.value;
      }
    }
    if (!best) {
      return null;
    }
    const relPath = abs.slice(best.root.length).replace(/^\//, '');
    return { projectId: best.projectId, relPath };
  }
}

function hostPathOf(href: string): string | null {
  const lineMatch = /:\d+$/.exec(href);
  const raw = lineMatch ? href.slice(0, -lineMatch[0].length) : href;
  if (raw.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(raw).pathname);
    } catch {
      return null;
    }
  }
  return raw.startsWith('/') ? raw : null;
}

function insideRoot(abs: string, root: string): boolean {
  const normalized = root.endsWith('/') ? root : `${root}/`;
  return abs === root || abs.startsWith(normalized);
}

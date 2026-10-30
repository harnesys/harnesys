import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { type Project, useCreateProject, useUpdateProject } from '@/entities/project';
import { appMetaQuery, fleetNodesQuery } from '@/shared/api';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { folderNameFromPath } from '../model/folder-name.ts';
import { FolderBrowserDialog } from './folder-browser-dialog.tsx';
import { ProjectFields } from './project-fields.tsx';
export function ProjectDetailsDialog({
  onResolve,
  data,
}: DialogComponentProps<
  Project,
  {
    project?: Project;
  }
>) {
  const project = data?.project ?? null;
  const editing = project !== null;
  const { data: nodes } = useQuery(fleetNodesQuery);
  const { data: meta } = useQuery(appMetaQuery());
  const [nodeId, setNodeId] = useState<string | undefined>(undefined);
  const metaNodeId = meta?.nodeId;
  const selectedNodeId = nodeId ?? metaNodeId ?? nodes?.[0]?.id;
  const [name, setName] = useState(project?.name ?? '');
  const [path, setPath] = useState(project?.path ?? '');
  const [nameTouched, setNameTouched] = useState(editing);
  const [browsing, setBrowsing] = useState(false);
  const create = useCreateProject();
  const update = useUpdateProject();
  const trimmedName = name.trim();
  const trimmedPath = path.trim();
  const needsPath = !editing && nodes !== undefined && nodes.length > 1;
  let invalid = false;
  if (editing || needsPath) {
    invalid = trimmedName.length === 0 || trimmedPath.length === 0;
  } else {
    invalid = trimmedName.length === 0 && trimmedPath.length === 0;
  }
  const busy = create.isPending || update.isPending;
  const applyPath = (next: string) => {
    setPath(next);
    if (!nameTouched) {
      setName(folderNameFromPath(next));
    }
  };
  return (
    <>
      <ProjectFields
        mode={editing ? 'edit' : 'create'}
        nodeId={selectedNodeId}
        selfNodeId={meta?.nodeId ?? undefined}
        name={name}
        path={path}
        nameRequired={!editing && trimmedPath.length === 0}
        pathRequired={editing}
        onNodeChange={setNodeId}
        onNameChange={(value) => {
          setNameTouched(true);
          setName(value);
        }}
        onPathChange={applyPath}
        onPick={() => {
          setBrowsing(true);
        }}
      />
      {browsing ? (
        <FolderBrowserDialog
          nodeId={selectedNodeId}
          nodeLabel={nodes?.find((node) => node.id === selectedNodeId)?.name}
          onResolve={(picked) => {
            setBrowsing(false);
            if (picked) {
              applyPath(picked);
            }
          }}
        />
      ) : null}
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={invalid || busy}
          onClick={() => {
            if (editing) {
              if (!project) {
                return;
              }
              void update
                .mutateAsync({
                  id: project.id,
                  name: trimmedName,
                  path: trimmedPath,
                })
                .then((next) => onResolve?.(next));
              return;
            }
            void create
              .mutateAsync({
                ...(trimmedPath ? { path: trimmedPath } : {}),
                ...(trimmedName ? { name: trimmedName } : {}),
                ...(!editing && nodes !== undefined && nodes.length > 1 && selectedNodeId
                  ? { nodeId: selectedNodeId }
                  : {}),
              })
              .then((created) => onResolve?.(created));
          }}
        >
          {editing ? 'Save' : 'Add source'}
        </Button>
      </DialogFooter>
    </>
  );
}

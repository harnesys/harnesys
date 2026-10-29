import { useQuery } from '@tanstack/react-query';
import { fleetNodesQuery } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

interface ProjectFieldsProps {
  mode: 'create' | 'edit';
  nodeId?: string;
  selfNodeId?: string;
  name: string;
  path: string;
  nameRequired?: boolean;
  pathRequired?: boolean;
  picking?: boolean;
  onNodeChange?: (id: string) => void;
  onNameChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onPick: () => void;
}
export function ProjectFields({
  mode,
  nodeId,
  selfNodeId,
  name,
  path,
  nameRequired = false,
  pathRequired = false,
  picking = false,
  onNodeChange,
  onNameChange,
  onPathChange,
  onPick,
}: ProjectFieldsProps) {
  const { data: nodes } = useQuery(fleetNodesQuery);
  const nodeItems = (nodes ?? []).map((node) => ({ value: node.id, label: node.name }));
  const showNodes = mode === 'create' && nodeItems.length > 1;
  const remoteSelected = showNodes && nodeId !== undefined && nodeId !== selfNodeId;
  const selectedNode = nodeItems.find((item) => item.value === nodeId);
  const nameInvalid = nameRequired && name.trim().length === 0;
  const pathInvalid = pathRequired && path.trim().length === 0;
  return (
    <FieldGroup>
      {showNodes ? (
        <Field>
          <FieldLabel htmlFor="source-host">Host</FieldLabel>
          <Select
            items={nodeItems}
            value={nodeId}
            onValueChange={(next) => {
              if (typeof next === 'string') {
                onNodeChange?.(next);
              }
            }}
          >
            <SelectTrigger id="source-host" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-full" align="start">
              {nodeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Host that owns this folder on disk.</FieldDescription>
        </Field>
      ) : null}
      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor="source-name">Name</FieldLabel>
        <Input
          id="source-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Docs"
          aria-invalid={nameInvalid || undefined}
        />
        {!nameRequired ? <FieldDescription>Defaults to the folder name.</FieldDescription> : null}
      </Field>
      <Field data-invalid={pathInvalid || undefined}>
        <FieldLabel htmlFor="source-path">Folder</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="source-path"
            value={path}
            readOnly={!remoteSelected}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder={remoteSelected ? '/home/user/work/app' : 'Choose a folder'}
            aria-invalid={pathInvalid || undefined}
          />
          <Button type="button" variant="outline" disabled={picking} onClick={onPick}>
            Browse
          </Button>
        </div>
        {remoteSelected ? (
          <FieldDescription>
            Browse folders on {selectedNode?.label ?? 'the selected host'}.
          </FieldDescription>
        ) : (
          <FieldDescription>{folderDescription(mode, pathRequired)}</FieldDescription>
        )}
      </Field>
    </FieldGroup>
  );
}
function folderDescription(mode: 'create' | 'edit', pathRequired: boolean): string {
  if (mode === 'edit') {
    return 'Must already exist on the host.';
  }
  if (pathRequired) {
    return 'Must already exist on the host.';
  }
  return 'Pick an existing folder on this host.';
}

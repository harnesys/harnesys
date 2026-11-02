export const ENTITY_REF_MIME = 'application/x-harnesys-entity-ref';

export type DraggedEntityKind = 'terminal' | 'source' | 'board' | 'schedule' | 'webhook';

export interface DraggedEntity {
  kind: DraggedEntityKind;
  id: string;
  name: string;
}

export function setEntityRefDrag(dataTransfer: DataTransfer, entity: DraggedEntity): void {
  dataTransfer.setData(ENTITY_REF_MIME, JSON.stringify(entity));
}

export function parseEntityRefDrag(dataTransfer: DataTransfer): DraggedEntity | null {
  const raw = dataTransfer.getData(ENTITY_REF_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DraggedEntity>;
    if (
      isDraggedEntityKind(parsed.kind) &&
      isNonEmptyString(parsed.id) &&
      isNonEmptyString(parsed.name)
    ) {
      return { kind: parsed.kind, id: parsed.id, name: parsed.name };
    }
  } catch {
    return null;
  }
  return null;
}

function isDraggedEntityKind(value: unknown): value is DraggedEntityKind {
  return (
    value === 'terminal' ||
    value === 'source' ||
    value === 'board' ||
    value === 'schedule' ||
    value === 'webhook'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

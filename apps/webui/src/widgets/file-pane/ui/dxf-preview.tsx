import { useQuery } from '@tanstack/react-query';
import { Helper } from 'dxf';
import { blobContentBackend, type FileRef } from '@/features/open-file';

function renderDxfSvg(contents: string): string {
  const svg = new Helper(contents).toSVG();
  return svg.replace(/<\?xml[^>]*\?>\s*/, '');
}

export function DxfPreview({ target }: { target: FileRef }) {
  const backend = blobContentBackend(target);
  const query = useQuery({
    queryKey: ['dxf-preview', backend.key],
    queryFn: async () => renderDxfSvg(await (await backend.load()).text()),
    retry: false,
  });
  if (query.isError) {
    const reason = query.error instanceof Error ? query.error.message : 'Unknown error';
    return (
      <div
        className="flex h-full w-full items-center justify-center p-4 text-muted-foreground text-sm"
        data-testid="dxf-preview-error"
      >
        Could not open DXF file: {reason}
      </div>
    );
  }
  if (query.isLoading || !query.data) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  return (
    <div
      className="h-full w-full overflow-auto bg-background p-4 [&_svg]:h-full [&_svg]:w-full [&_svg]:hue-rotate-180 [&_svg]:invert"
      data-testid="dxf-preview"
      dangerouslySetInnerHTML={{ __html: query.data }}
    />
  );
}

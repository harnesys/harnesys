export type Rotation = 0 | 90 | 180 | 270;

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageEdits {
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
}

export const IDENTITY_EDITS: ImageEdits = { rotation: 0, flipH: false, flipV: false };

const SAVE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export function sameEdits(a: ImageEdits, b: ImageEdits): boolean {
  return a.rotation === b.rotation && a.flipH === b.flipH && a.flipV === b.flipV;
}

export function editsChanged(edits: ImageEdits): boolean {
  return !sameEdits(edits, IDENTITY_EDITS);
}

export function rotateEdits(edits: ImageEdits, step: 1 | -1): ImageEdits {
  const rotation = (edits.rotation + step * 90 + 360) % 360;
  return { ...edits, rotation: rotation as Rotation };
}

export function flipEdits(edits: ImageEdits, axis: 'h' | 'v'): ImageEdits {
  return axis === 'h' ? { ...edits, flipH: !edits.flipH } : { ...edits, flipV: !edits.flipV };
}

export function editedBoxOf(size: ImageSize, edits: ImageEdits): ImageSize {
  return edits.rotation === 90 || edits.rotation === 270
    ? { width: size.height, height: size.width }
    : size;
}

export function saveMimeForPath(path: string): string | null {
  const dot = path.lastIndexOf('.');
  if (dot === -1) {
    return null;
  }
  return SAVE_MIME_BY_EXTENSION[path.slice(dot).toLowerCase()] ?? null;
}

export async function exportEditedImage(
  url: string,
  edits: ImageEdits,
  mime: string,
): Promise<Uint8Array> {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob());
  const box = editedBoxOf({ width: bitmap.width, height: bitmap.height }, edits);
  const canvas = document.createElement('canvas');
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas 2D context is unavailable');
  }
  ctx.translate(box.width / 2, box.height / 2);
  ctx.rotate((edits.rotation * Math.PI) / 180);
  ctx.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Image encoding failed'));
        }
      },
      mime,
      0.92,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

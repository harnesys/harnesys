const AVATAR_SIDE = 256;
const AVATAR_INPUT_MAX_BYTES = 10 * 1024 * 1024;

export async function avatarDataUrlFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file');
  }
  if (file.size > AVATAR_INPUT_MAX_BYTES) {
    throw new Error('Image must be under 10 MB');
  }
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Canvas 2D context is unavailable');
  }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIDE,
    AVATAR_SIDE,
  );
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.85);
}

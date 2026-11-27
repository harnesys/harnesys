type FileIconGlyph = 'text' | 'doc' | 'image';

export interface FileIconStyle {
  from: string;
  to: string;
  glyph: FileIconGlyph;
  text?: string;
}

const IMAGE_STYLE: FileIconStyle = { from: '#58a5c0', to: '#2a657d', glyph: 'image' };
const GENERIC_STYLE: FileIconStyle = { from: '#8a8a92', to: '#4e4e56', glyph: 'doc' };

const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
  'avif',
  'heic',
]);
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz']);
const SHELL_EXTS = new Set(['sh', 'bash', 'zsh']);

export const FILE_ICON_STYLES: Record<string, FileIconStyle> = {
  ts: { from: '#6b9fd8', to: '#3b6ba6', glyph: 'text', text: 'TS' },
  tsx: { from: '#6b9fd8', to: '#3b6ba6', glyph: 'text', text: 'TS' },
  js: { from: '#d8b45a', to: '#96762a', glyph: 'text', text: 'JS' },
  jsx: { from: '#d8b45a', to: '#96762a', glyph: 'text', text: 'JS' },
  mjs: { from: '#d8b45a', to: '#96762a', glyph: 'text', text: 'JS' },
  cjs: { from: '#d8b45a', to: '#96762a', glyph: 'text', text: 'JS' },
  json: { from: '#8590d8', to: '#525d9e', glyph: 'text', text: '{}' },
  jsonc: { from: '#8590d8', to: '#525d9e', glyph: 'text', text: '{}' },
  md: { from: '#9d8fe0', to: '#5f4fb0', glyph: 'text', text: 'M↓' },
  mdx: { from: '#9d8fe0', to: '#5f4fb0', glyph: 'text', text: 'M↓' },
  dxf: { from: '#d0a855', to: '#8f6e28', glyph: 'doc', text: 'DXF' },
  html: { from: '#dd8a52', to: '#9c5a2a', glyph: 'text', text: '</>' },
  css: { from: '#6aa5dd', to: '#35709e', glyph: 'text', text: '#' },
  scss: { from: '#cc7aa6', to: '#8a4a6e', glyph: 'text', text: '#' },
  less: { from: '#cc7aa6', to: '#8a4a6e', glyph: 'text', text: '#' },
  vue: { from: '#5fae7e', to: '#2f704a', glyph: 'text', text: 'VUE' },
  svelte: { from: '#d97570', to: '#94403c', glyph: 'text', text: 'SV' },
  py: { from: '#5b91cc', to: '#356091', glyph: 'text', text: 'PY' },
  go: { from: '#5fb2c9', to: '#2f7285', glyph: 'text', text: 'GO' },
  rs: { from: '#cc8050', to: '#8a4e28', glyph: 'text', text: 'RS' },
  php: { from: '#8890cc', to: '#4f568e', glyph: 'text', text: 'PHP' },
  sql: { from: '#a37cc9', to: '#66448a', glyph: 'text', text: 'SQL' },
  xml: { from: '#a3ac52', to: '#62681f', glyph: 'text', text: 'XML' },
  yml: { from: '#8598ab', to: '#4c5f70', glyph: 'text', text: 'YML' },
  yaml: { from: '#8598ab', to: '#4c5f70', glyph: 'text', text: 'YML' },
  toml: { from: '#8598ab', to: '#4c5f70', glyph: 'text', text: 'TOML' },
  env: { from: '#8598ab', to: '#4c5f70', glyph: 'text', text: 'ENV' },
  docx: { from: '#5f8ec9', to: '#315d91', glyph: 'text', text: 'W' },
  doc: { from: '#5f8ec9', to: '#315d91', glyph: 'text', text: 'W' },
  xlsx: { from: '#5fa878', to: '#2f6b45', glyph: 'text', text: 'X' },
  xls: { from: '#5fa878', to: '#2f6b45', glyph: 'text', text: 'X' },
  csv: { from: '#5fa878', to: '#2f6b45', glyph: 'text', text: 'CSV' },
  pptx: { from: '#cc8258', to: '#8a4e2c', glyph: 'text', text: 'P' },
  pdf: { from: '#c26565', to: '#853a3a', glyph: 'doc' },
};

function fileExt(name: string): string {
  const base = name.replaceAll('\\', '/').split('/').pop() ?? name;
  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return base.slice(1).toLowerCase();
  }
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot + 1).toLowerCase();
}

export function iconStyleForFile(
  name: string,
  mediaType: string | null | undefined,
): FileIconStyle {
  const ext = fileExt(name);
  const style = FILE_ICON_STYLES[ext];
  if (style) {
    return style;
  }
  if (IMAGE_EXTS.has(ext) || mediaType?.startsWith('image/')) {
    return IMAGE_STYLE;
  }
  if (ARCHIVE_EXTS.has(ext)) {
    return { from: '#c08a4a', to: '#7d5525', glyph: 'text', text: 'ZIP' };
  }
  if (SHELL_EXTS.has(ext)) {
    return { from: '#63a868', to: '#33703a', glyph: 'text', text: '$' };
  }
  return GENERIC_STYLE;
}

function mixWithWhite(hex: string, ratio: number): string {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * ratio));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function iconGlyphColor(style: FileIconStyle): string {
  return mixWithWhite(style.to, 0.45);
}

export function iconGlyphFontSize(text: string): number {
  if (text.length >= 4) {
    return 4.2;
  }
  if (text.length === 3) {
    return 5.2;
  }
  if (text.length === 2) {
    return 6.2;
  }
  return 7.4;
}

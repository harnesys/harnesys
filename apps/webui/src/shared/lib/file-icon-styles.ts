type FileIconGlyph = 'text' | 'doc' | 'image';

export interface FileIconStyle {
  from: string;
  to: string;
  glyph: FileIconGlyph;
  text?: string;
}

const IMAGE_STYLE: FileIconStyle = { from: '#3aa8c9', to: '#155e75', glyph: 'image' };
const GENERIC_STYLE: FileIconStyle = { from: '#7c7c84', to: '#3d3d43', glyph: 'doc' };

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
  ts: { from: '#5b8def', to: '#27509c', glyph: 'text', text: 'TS' },
  tsx: { from: '#5b8def', to: '#27509c', glyph: 'text', text: 'TS' },
  js: { from: '#d9a923', to: '#8a6410', glyph: 'text', text: 'JS' },
  jsx: { from: '#d9a923', to: '#8a6410', glyph: 'text', text: 'JS' },
  mjs: { from: '#d9a923', to: '#8a6410', glyph: 'text', text: 'JS' },
  cjs: { from: '#d9a923', to: '#8a6410', glyph: 'text', text: 'JS' },
  json: { from: '#6e7bd9', to: '#36418f', glyph: 'text', text: '{}' },
  jsonc: { from: '#6e7bd9', to: '#36418f', glyph: 'text', text: '{}' },
  md: { from: '#8b7cf0', to: '#4636a8', glyph: 'text', text: 'M↓' },
  dxf: { from: '#e0b34a', to: '#a8791c', glyph: 'doc', text: 'DXF' },
  mdx: { from: '#8b7cf0', to: '#4636a8', glyph: 'text', text: 'M↓' },
  html: { from: '#e0823c', to: '#8f4212', glyph: 'text', text: '</>' },
  css: { from: '#4fa8e8', to: '#1c5f96', glyph: 'text', text: '#' },
  scss: { from: '#d16a9e', to: '#8c2f5e', glyph: 'text', text: '#' },
  less: { from: '#d16a9e', to: '#8c2f5e', glyph: 'text', text: '#' },
  vue: { from: '#4db874', to: '#1f6b3d', glyph: 'text', text: 'VUE' },
  svelte: { from: '#e0655f', to: '#8a2a26', glyph: 'text', text: 'SV' },
  py: { from: '#4a8ac9', to: '#23517f', glyph: 'text', text: 'PY' },
  go: { from: '#4fc3d9', to: '#17606e', glyph: 'text', text: 'GO' },
  rs: { from: '#d97b3f', to: '#8a3c12', glyph: 'text', text: 'RS' },
  php: { from: '#7b83c9', to: '#3d4480', glyph: 'text', text: 'PHP' },
  sql: { from: '#a86bc9', to: '#5c2f7a', glyph: 'text', text: 'SQL' },
  xml: { from: '#9aa53c', to: '#4f5a12', glyph: 'text', text: 'XML' },
  yml: { from: '#7d93a8', to: '#3c4f60', glyph: 'text', text: 'YML' },
  yaml: { from: '#7d93a8', to: '#3c4f60', glyph: 'text', text: 'YML' },
  toml: { from: '#7d93a8', to: '#3c4f60', glyph: 'text', text: 'TOML' },
  env: { from: '#7d93a8', to: '#3c4f60', glyph: 'text', text: 'ENV' },
  docx: { from: '#4f8bd9', to: '#1c4f96', glyph: 'text', text: 'W' },
  doc: { from: '#4f8bd9', to: '#1c4f96', glyph: 'text', text: 'W' },
  xlsx: { from: '#4faf6e', to: '#1c6b38', glyph: 'text', text: 'X' },
  xls: { from: '#4faf6e', to: '#1c6b38', glyph: 'text', text: 'X' },
  csv: { from: '#4faf6e', to: '#1c6b38', glyph: 'text', text: 'CSV' },
  pptx: { from: '#e08a55', to: '#96431a', glyph: 'text', text: 'P' },
  pdf: { from: '#c25454', to: '#7a2724', glyph: 'doc' },
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
    return { from: '#c9853d', to: '#7c4512', glyph: 'text', text: 'ZIP' };
  }
  if (SHELL_EXTS.has(ext)) {
    return { from: '#57a05c', to: '#245c28', glyph: 'text', text: '$' };
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

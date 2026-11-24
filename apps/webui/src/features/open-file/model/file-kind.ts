export type OpenFileKind = 'text' | 'image' | 'pdf' | 'docx' | 'xlsx' | 'dxf' | 'csv';
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const DXF_EXTS = new Set(['dxf']);
const PDF_EXTS = new Set(['pdf']);
const DOCX_EXTS = new Set(['docx']);
const XLSX_EXTS = new Set(['xlsx', 'xls']);
const CSV_EXTS = new Set(['csv', 'tsv']);
const MARKDOWN_EXTS = new Set(['md', 'mdx', 'markdown']);
export function fileBasename(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop() ?? path;
}
export function fileExtension(path: string): string {
  const base = fileBasename(path);
  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return base.slice(1).toLowerCase();
  }
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot + 1).toLowerCase();
}
/** Anything without a dedicated renderer opens as text; the reader rejects binary content. */
export function openFileKind(path: string): OpenFileKind {
  const ext = fileExtension(path);
  if (IMAGE_EXTS.has(ext)) {
    return 'image';
  }
  if (PDF_EXTS.has(ext)) {
    return 'pdf';
  }
  if (DOCX_EXTS.has(ext)) {
    return 'docx';
  }
  if (XLSX_EXTS.has(ext)) {
    return 'xlsx';
  }
  if (CSV_EXTS.has(ext)) {
    return 'csv';
  }
  if (DXF_EXTS.has(ext)) {
    return 'dxf';
  }
  return 'text';
}
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTS.has(fileExtension(path));
}

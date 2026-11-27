export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtOf(name: string): string {
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

const TEXT_EXTS = new Set([
  'txt',
  'md',
  'mdx',
  'json',
  'jsonc',
  'csv',
  'tsv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'scss',
  'less',
  'html',
  'vue',
  'svelte',
  'py',
  'go',
  'rs',
  'php',
  'java',
  'kt',
  'rb',
  'sh',
  'bash',
  'zsh',
  'sql',
  'yml',
  'yaml',
  'toml',
  'ini',
  'env',
  'xml',
  'svg',
  'log',
  'diff',
  'patch',
]);

export function isTextLike(name: string, mediaType: string): boolean {
  if (mediaType.startsWith('text/')) {
    return true;
  }
  if (mediaType === 'application/json' || mediaType === 'application/xml') {
    return true;
  }
  return TEXT_EXTS.has(fileExtOf(name));
}

export function fileExtLabel(name: string, mediaType = ''): string {
  const ext = fileExtOf(name);
  if (ext) {
    return ext.toUpperCase();
  }
  if (mediaType.startsWith('image/')) {
    return 'Image';
  }
  if (mediaType.startsWith('audio/')) {
    return 'Audio';
  }
  if (mediaType.startsWith('video/')) {
    return 'Video';
  }
  return 'File';
}

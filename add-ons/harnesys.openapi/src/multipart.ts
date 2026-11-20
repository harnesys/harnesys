export interface MultipartFile {
  name: string;
  filename?: string;
  contentType?: string;
  path?: string;
  content?: string;
  contentBase64?: string;
}

export interface MultipartPayload {
  bodyBase64: string;
  contentType: string;
}

export type FileReader = (path: string, offset: number) => Promise<{ data: string; eof: boolean }>;

const MAX_FILE_CHUNKS = 1024;

export async function assembleFileBytes(path: string, read: FileReader): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index <= MAX_FILE_CHUNKS; index += 1) {
    const chunk = await read(path, offset);
    const bytes = new Uint8Array(Buffer.from(chunk.data, 'base64'));
    chunks.push(bytes);
    offset += bytes.byteLength;
    if (chunk.eof) {
      return concatBytes(chunks);
    }
  }
  throw new Error(`file '${path}' exceeds ${MAX_FILE_CHUNKS} read chunks`);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const chunk of chunks) {
    size += chunk.byteLength;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

export function parseFiles(raw: unknown): MultipartFile[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(
      'files must be an array of {name, filename?, contentType?, content? | contentBase64?}',
    );
  }
  return raw.map((entry, index) => singleFile(entry, index));
}

function singleFile(entry: unknown, index: number): MultipartFile {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`files[${index}] must be an object`);
  }
  const record = entry as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`files[${index}].name is required`);
  }
  const hasText = typeof record.content === 'string';
  const hasBase64 = typeof record.contentBase64 === 'string';
  const hasPath = typeof record.path === 'string' && record.path.length > 0;
  const sources = [hasText, hasBase64, hasPath].filter(Boolean).length;
  if (sources !== 1) {
    throw new Error(
      `files[${index}] must carry exactly one of content (text), contentBase64, or path (thread file)`,
    );
  }
  return {
    name,
    ...(typeof record.filename === 'string' && record.filename.length > 0
      ? { filename: record.filename }
      : {}),
    ...(typeof record.contentType === 'string' && record.contentType.length > 0
      ? { contentType: record.contentType }
      : {}),
    ...(hasPath ? { path: record.path as string } : {}),
    ...(hasText ? { content: record.content as string } : {}),
    ...(hasBase64 ? { contentBase64: record.contentBase64 as string } : {}),
  };
}

export function multipartPayload(
  fields: Record<string, string>,
  files: MultipartFile[],
): MultipartPayload {
  const boundary = `harnesys-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let size = 0;
  const push = (chunk: Uint8Array): void => {
    parts.push(chunk);
    size += chunk.byteLength;
  };
  for (const [key, value] of Object.entries(fields)) {
    push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  for (const file of files) {
    const headers = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename ?? file.name}"\r\n` +
        `Content-Type: ${file.contentType ?? 'application/octet-stream'}\r\n\r\n`,
    );
    push(headers);
    push(fileBytes(file));
    push(encoder.encode('\r\n'));
  }
  push(encoder.encode(`--${boundary}--\r\n`));
  return {
    bodyBase64: Buffer.concat(parts, size).toString('base64'),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function fileBytes(file: MultipartFile): Uint8Array {
  if (file.contentBase64 !== undefined) {
    return new Uint8Array(Buffer.from(file.contentBase64, 'base64'));
  }
  return new TextEncoder().encode(file.content ?? '');
}

import {
  CREDENTIAL_PLUGIN_FILE_FLAG,
  CREDENTIAL_PLUGIN_PROTOCOL,
  CREDENTIAL_PLUGIN_SOCKET_FLAG,
} from 'harnesys';

const FLAG = CREDENTIAL_PLUGIN_SOCKET_FLAG;
const FILE_FLAG = CREDENTIAL_PLUGIN_FILE_FLAG;
const PROTOCOL = CREDENTIAL_PLUGIN_PROTOCOL;
const SOCKET_TIMEOUT_MS = 10_000;

interface PluginEnvelope {
  request?: { itemRef?: unknown; profileName?: unknown };
  item?: unknown;
}

function itemRefOf(raw: string): string {
  try {
    const envelope = JSON.parse(raw) as PluginEnvelope;
    const ref = envelope.request?.itemRef ?? envelope.request?.profileName ?? envelope.item;
    return typeof ref === 'string' ? ref : '';
  } catch {
    return '';
  }
}

function failure(): string {
  return `${JSON.stringify({ protocol: PROTOCOL, success: false })}\n`;
}

async function write(value: string): Promise<void> {
  await Bun.write(Bun.stdout, value);
}

async function exchange(socketPath: string, token: string, item: string): Promise<string> {
  return await new Promise<string>((resolve) => {
    let buffered = '';
    let settled = false;
    const finish = (value: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(failure()), SOCKET_TIMEOUT_MS);
    void Bun.connect({
      unix: socketPath,
      socket: {
        open: (socket) => {
          socket.write(`${JSON.stringify({ token, item })}\n`);
        },
        data: (_socket, chunk) => {
          buffered += new TextDecoder().decode(chunk);
          if (buffered.includes('\n')) {
            finish(buffered);
          }
        },
        close: () => finish(buffered.includes('\n') ? buffered : failure()),
        error: () => finish(failure()),
      },
    }).catch(() => finish(failure()));
  });
}

async function runFileMode(path: string): Promise<void> {
  let payload = '';
  try {
    payload = await Bun.file(path).text();
  } catch {
    await write(failure());
    return;
  }
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (
      typeof parsed.username !== 'string' ||
      typeof parsed.password !== 'string' ||
      typeof parsed.url !== 'string'
    ) {
      await write(failure());
      return;
    }
    await write(
      `${JSON.stringify({
        protocol: PROTOCOL,
        success: true,
        credential: {
          username: parsed.username,
          password: parsed.password,
          url: parsed.url,
        },
      })}\n`,
    );
  } catch {
    await write(failure());
  }
}

export async function runCredentialPluginMode(argv: readonly string[]): Promise<boolean> {
  const fileIndex = argv.indexOf(FILE_FLAG);
  if (fileIndex !== -1) {
    const path = argv[fileIndex + 1] ?? '';
    await runFileMode(path);
    return true;
  }
  const index = argv.indexOf(FLAG);
  if (index === -1) {
    return false;
  }
  const socketPath = argv[index + 1] ?? '';
  const token = argv[index + 2] ?? '';
  if (socketPath === '' || token === '') {
    await write(failure());
    return true;
  }
  const raw = await new Response(Bun.stdin.stream()).text();
  const item = itemRefOf(raw);
  if (item === '') {
    await write(failure());
    return true;
  }
  const response = await exchange(socketPath, token, item);
  await write(response.endsWith('\n') ? response : `${response}\n`);
  return true;
}

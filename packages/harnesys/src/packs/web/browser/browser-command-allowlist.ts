import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const GET_SUBCOMMANDS = new Set(['title', 'text', 'url', 'count']);
const IS_SUBCOMMANDS = new Set(['visible', 'enabled', 'checked']);

const SIMPLE_COMMANDS = new Set([
  'open',
  'snapshot',
  'click',
  'dblclick',
  'type',
  'fill',
  'press',
  'hover',
  'focus',
  'select',
  'check',
  'uncheck',
  'scroll',
  'scrollintoview',
  'wait',
  'back',
  'forward',
  'reload',
  'tab',
  'screenshot',
  'close',
]);

const ALLOWED_FLAGS = new Set([
  '--json',
  '--text',
  '--timeout',
  '--full-page',
  '--label',
  '--interactive',
  '--compact',
  '--depth',
  '--selector',
  '--new-tab',
  '--by',
  '-i',
  '-c',
  '-d',
  '-s',
]);

export class BrowserCommandNotAllowedError extends Error {
  readonly command: string;
  readonly code = 'browser_command_not_allowed';

  constructor(command: string, reason: string) {
    super(
      `[browser_command_not_allowed] "${command}" is unavailable in credentialed sessions: ${reason}. Use the allowed interaction commands, or ask the user for a separate session.`,
    );
    this.name = 'BrowserCommandNotAllowedError';
    this.command = command;
  }
}

export function assertBrowserCommandAllowed(command: string, args: readonly string[]): void {
  if (!SIMPLE_COMMANDS.has(command)) {
    if (command === 'get') {
      assertGetCommand(args);
      return;
    }
    if (command === 'is') {
      assertSubcommand(command, args, IS_SUBCOMMANDS);
      return;
    }
    throw new BrowserCommandNotAllowedError(command, 'command is not on the allowlist');
  }
  assertFlagsAllowed(command, args);
  assertNavigationTarget(command, args);
}

const DANGEROUS_SCHEMES = new Set([
  'file',
  'javascript',
  'data',
  'blob',
  'chrome',
  'chrome-extension',
  'about',
  'view-source',
  'vbscript',
  'ftp',
  'ws',
  'wss',
]);

function assertNavigationTarget(command: string, args: readonly string[]): void {
  if (command === 'open') {
    assertSafeTargets(command, args);
    return;
  }
  if (command === 'tab' && args[0] === 'new') {
    assertSafeTargets(command, args.slice(1));
  }
}

function assertSafeTargets(command: string, tokens: readonly string[]): void {
  for (const token of tokens) {
    if (token.startsWith('-')) {
      continue;
    }
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(token)?.[1]?.toLowerCase();
    if (scheme !== undefined && DANGEROUS_SCHEMES.has(scheme)) {
      throw new BrowserCommandNotAllowedError(
        command,
        'local, script, and extension URLs are blocked in credentialed sessions',
      );
    }
  }
}

function assertGetCommand(args: readonly string[]): void {
  assertSubcommand('get', args, GET_SUBCOMMANDS);
  assertFlagsAllowed('get', args);
}

function assertSubcommand(
  command: string,
  args: readonly string[],
  allowed: ReadonlySet<string>,
): void {
  const sub = args[0];
  if (sub === undefined || !allowed.has(sub)) {
    throw new BrowserCommandNotAllowedError(command, `subcommand "${sub ?? ''}" is not allowed`);
  }
}

const VALUE_FLAGS = new Set([
  '--text',
  '--timeout',
  '--selector',
  '--depth',
  '--label',
  '--by',
  '-s',
  '-d',
]);

function assertFlagsAllowed(command: string, args: readonly string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? '';
    if (token === '-' || /^-\d/.test(token)) {
      continue;
    }
    if (!token.startsWith('-')) {
      continue;
    }
    if (!ALLOWED_FLAGS.has(token)) {
      throw new BrowserCommandNotAllowedError(command, `flag "${token}" is not allowed`);
    }
    if (VALUE_FLAGS.has(token)) {
      index += 1;
    }
  }
}

const POLICY_DIR = join('/tmp', 'harnesys-browser');
const POLICY_FILE = join(POLICY_DIR, 'action-policy.json');
const LOGIN_POLICY_FILE = join(POLICY_DIR, 'login-action-policy.json');

const POLICY_DENY = [
  'evaluate',
  'addscript',
  'addinitscript',
  'addstyle',
  'expose',
  'setcontent',
  'cookies_set',
  'cookies_clear',
  'state_save',
  'state_load',
  'state_list',
  'state_show',
  'state_clear',
  'state_rename',
  'storage_get',
  'storage_set',
  'storage_clear',
  'network_route',
  'network_unroute',
  'network_requests',
  'har_start',
  'har_stop',
  'flow_save',
  'flow_run',
  'flow_steps',
  'upload',
  'download',
  'waitfordownload',
  'webmcp',
  'batch',
] as const;

const LOGIN_POLICY_DENY = POLICY_DENY.filter((action) => action !== 'cookies_set');

let policyPathCache: string | null = null;
let loginPolicyPathCache: string | null = null;

async function writePolicy(path: string, deny: readonly string[]): Promise<string> {
  await mkdir(POLICY_DIR, { recursive: true });
  await writeFile(path, JSON.stringify({ default: 'allow', deny }), { mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  return path;
}

export async function hardenedActionPolicyPath(): Promise<string> {
  policyPathCache ??= await writePolicy(POLICY_FILE, POLICY_DENY);
  return policyPathCache;
}

export async function loginActionPolicyPath(): Promise<string> {
  loginPolicyPathCache ??= await writePolicy(LOGIN_POLICY_FILE, LOGIN_POLICY_DENY);
  return loginPolicyPathCache;
}

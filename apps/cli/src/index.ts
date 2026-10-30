import packageJson from '../package.json' with { type: 'json' };
import { commandDoctor } from './host-doctor.ts';
import { commandEnroll } from './host-enroll.ts';
import { commandInvite } from './host-invite.ts';
import { commandPromote } from './host-promote.ts';
import { commandRetarget } from './host-retarget.ts';
import { commandLogin } from './login.ts';
import { commandOwnerInit } from './owner-init.ts';
import { commandUpdate } from './update.ts';

export type CliMode =
  | 'help'
  | 'version'
  | 'login'
  | 'owner-init'
  | 'host-invite'
  | 'host-enroll'
  | 'host-retarget'
  | 'host-promote'
  | 'host-doctor'
  | 'update'
  | 'unknown';

export interface CliArgs {
  mode: CliMode;
  detail?: string;
  orgId?: string;
  name?: string;
  ttlMin?: number;
  relayUrl?: string;
  code?: string;
  repo?: string;
  targetNodeId?: string;
  newRelayUrl?: string;
  accept?: boolean;
  from?: string;
  token?: string;
}

export const CLI_VERSION = packageJson.version;

export function parseArgs(argv: string[]): CliArgs {
  const [cmd, sub, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    return { mode: 'help' };
  }
  if (cmd === '--version' || cmd === '-V' || cmd === 'version') {
    return { mode: 'version' };
  }
  if (cmd === 'login') {
    return { mode: 'login', relayUrl: sub };
  }
  if (cmd === 'owner') {
    if (!sub || sub === 'help' || sub === '--help') {
      return { mode: 'help' };
    }
    if (sub === 'init') {
      return { mode: 'owner-init' };
    }
    return { mode: 'unknown', detail: `owner ${sub}` };
  }
  if (cmd === 'update') {
    return { mode: 'update', repo: readFlag(argv, '--repo') };
  }
  if (cmd !== 'host') {
    return { mode: 'unknown', detail: cmd };
  }
  if (!sub || sub === 'help' || sub === '--help') {
    return { mode: 'help' };
  }
  return parseHostSubcommand(sub, rest);
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseHostSubcommand(sub: string, rest: string[]): CliArgs {
  const flags = parseFlags(rest);
  if (sub === 'invite') {
    return {
      mode: 'host-invite',
      orgId: flags.org,
      name: flags.name ?? 'worker',
      ttlMin: flags.ttlMin,
    };
  }
  if (sub === 'enroll') {
    return {
      mode: 'host-enroll',
      relayUrl: flags.positional[0],
      code: flags.positional[1],
      orgId: flags.org,
      name: flags.name ?? 'worker',
    };
  }
  if (sub === 'retarget') {
    return { mode: 'host-retarget', orgId: flags.org, relayUrl: flags.positional[0] };
  }
  if (sub === 'promote') {
    return {
      mode: 'host-promote',
      orgId: flags.org,
      accept: flags.accept,
      targetNodeId: flags.targetNode,
      newRelayUrl: flags.relayUrl,
      from: flags.from,
      token: flags.token,
    };
  }
  if (sub === 'doctor') {
    return { mode: 'host-doctor' };
  }
  return { mode: 'unknown', detail: `host ${sub}` };
}

interface ParsedFlags {
  org?: string;
  name?: string;
  ttlMin?: number;
  accept?: boolean;
  targetNode?: string;
  relayUrl?: string;
  from?: string;
  token?: string;
  positional: string[];
}

const VALUE_FLAGS = new Set([
  '--org',
  '--name',
  '--ttl',
  '--target-node',
  '--relay-url',
  '--from',
  '--token',
]);

function parseFlags(argv: string[]): ParsedFlags {
  const positional: string[] = [];
  const out: ParsedFlags = { positional };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--accept') {
      out.accept = true;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      i = applyValueFlag(out, arg, argv[i + 1], i);
      continue;
    }
    positional.push(arg);
  }
  return out;
}

function applyValueFlag(
  out: ParsedFlags,
  flag: string,
  value: string | undefined,
  index: number,
): number {
  if (flag === '--org') {
    out.org = value;
  } else if (flag === '--name') {
    out.name = value;
  } else if (flag === '--ttl') {
    out.ttlMin = value ? Number.parseInt(value, 10) : undefined;
  } else if (flag === '--target-node') {
    out.targetNode = value;
  } else if (flag === '--relay-url') {
    out.relayUrl = value;
  } else if (flag === '--from') {
    out.from = value;
  } else if (flag === '--token') {
    out.token = value;
  }
  return index + 1;
}

export const USAGE = `harnesys ${CLI_VERSION}

usage:
  harnesys help
  harnesys --version
  harnesys login <relayUrl>
  harnesys owner init
  harnesys host invite --org <orgId> --name <nodeName> [--ttl 15]
  harnesys host enroll <relayUrl> <code> --org <orgId> --name <nodeName>
  harnesys host retarget --org <orgId> <newRelayUrl>
  harnesys host promote --org <orgId> --target-node <nodeId> --relay-url <url>
  harnesys host promote --org <orgId> --accept --from <url> --token <token>
  harnesys host doctor
  harnesys update [--repo <owner/name>]
`;

const HOST_HANDLERS: Record<
  Exclude<CliMode, 'help' | 'version' | 'unknown'>,
  (args: CliArgs) => Promise<void>
> = {
  login: (args) => commandLogin({ relayUrl: args.relayUrl }),
  'owner-init': () => commandOwnerInit(),
  'host-invite': (args) =>
    commandInvite({
      name: args.name ?? 'worker',
      orgId: args.orgId ?? '',
      ttlMin: args.ttlMin,
    }),
  'host-enroll': (args) =>
    commandEnroll({
      relayUrl: args.relayUrl ?? '',
      code: args.code ?? '',
      name: args.name ?? 'worker',
      orgId: args.orgId ?? '',
    }),
  'host-retarget': (args) => commandRetarget(args.orgId ?? '', args.relayUrl ?? ''),
  'host-promote': (args) =>
    commandPromote({
      orgId: args.orgId ?? '',
      accept: args.accept,
      targetNodeId: args.targetNodeId,
      newRelayUrl: args.newRelayUrl,
      from: args.from,
      token: args.token,
    }),
  'host-doctor': () => commandDoctor(),
  update: (args) => commandUpdate(args.repo),
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'help') {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (args.mode === 'version') {
    process.stdout.write(`${CLI_VERSION}\n`);
    process.exit(0);
  }
  const handler = HOST_HANDLERS[args.mode as keyof typeof HOST_HANDLERS];
  if (handler) {
    await handler(args);
    return;
  }
  process.stderr.write(`unknown command: ${args.detail ?? ''}\n${USAGE}\n`);
  process.exit(1);
}

if (import.meta.main) {
  void main();
}

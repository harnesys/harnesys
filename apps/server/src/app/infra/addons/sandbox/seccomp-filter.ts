export type SeccompArch = 'x86_64' | 'aarch64';

export const AUDIT_ARCH_X86_64 = 0xc000003e;
export const AUDIT_ARCH_AARCH64 = 0xc00000b7;

const BPF_LD_ABS_WORD = 0x20;
const BPF_JEQ_K = 0x15;
const BPF_JGE_K = 0x35;
const BPF_RET_K = 0x06;

const SECCOMP_RET_KILL_PROCESS = 0x80000000;
const SECCOMP_RET_ERRNO = 0x00050000;
const SECCOMP_RET_ALLOW = 0x7fff0000;
const EPERM = 1;
const SECCOMP_RET_ERRNO_EPERM = SECCOMP_RET_ERRNO | EPERM;

export interface DeniedSyscall {
  readonly name: string;
  readonly x86_64: number | null;
  readonly aarch64: number | null;
}

// Deny-list (not allow-list): unlisted syscalls are allowed so an unaccounted
// bun syscall cannot crash the sandbox. clone/clone3 stay allowed: bun needs
// threads; process launching is closed by execve/execveat/fork/vfork instead.
// The fsopen family is denied alongside mount/umount2: with a user namespace
// gained via clone(CLONE_NEWUSER) it would grant CAP_SYS_ADMIN in a new mount
// namespace, re-enabling mounts that the legacy mount(2) deny already covers.
export const DENIED_SYSCALLS: readonly DeniedSyscall[] = [
  { name: 'socket', x86_64: 41, aarch64: 198 },
  { name: 'socketpair', x86_64: 53, aarch64: 199 },
  { name: 'connect', x86_64: 42, aarch64: 203 },
  { name: 'bind', x86_64: 49, aarch64: 200 },
  { name: 'listen', x86_64: 50, aarch64: 201 },
  { name: 'accept', x86_64: 43, aarch64: 202 },
  { name: 'accept4', x86_64: 288, aarch64: 242 },
  { name: 'sendto', x86_64: 44, aarch64: 206 },
  { name: 'sendmsg', x86_64: 46, aarch64: 211 },
  { name: 'sendmmsg', x86_64: 307, aarch64: 269 },
  { name: 'recvfrom', x86_64: 45, aarch64: 207 },
  { name: 'recvmsg', x86_64: 47, aarch64: 212 },
  { name: 'recvmmsg', x86_64: 299, aarch64: 243 },
  { name: 'execve', x86_64: 59, aarch64: 221 },
  { name: 'execveat', x86_64: 322, aarch64: 281 },
  { name: 'fork', x86_64: 57, aarch64: null },
  { name: 'vfork', x86_64: 58, aarch64: null },
  { name: 'ptrace', x86_64: 101, aarch64: 117 },
  { name: 'process_vm_readv', x86_64: 310, aarch64: 270 },
  { name: 'process_vm_writev', x86_64: 311, aarch64: 271 },
  { name: 'mount', x86_64: 165, aarch64: 40 },
  { name: 'umount2', x86_64: 166, aarch64: 39 },
  { name: 'pivot_root', x86_64: 155, aarch64: 41 },
  { name: 'setns', x86_64: 308, aarch64: 268 },
  { name: 'unshare', x86_64: 272, aarch64: 97 },
  { name: 'bpf', x86_64: 321, aarch64: 280 },
  { name: 'keyctl', x86_64: 250, aarch64: 219 },
  { name: 'add_key', x86_64: 248, aarch64: 217 },
  { name: 'request_key', x86_64: 249, aarch64: 218 },
  { name: 'open_by_handle_at', x86_64: 304, aarch64: 265 },
  { name: 'perf_event_open', x86_64: 298, aarch64: 241 },
  { name: 'userfaultfd', x86_64: 323, aarch64: 282 },
  { name: 'init_module', x86_64: 175, aarch64: 105 },
  { name: 'finit_module', x86_64: 313, aarch64: 273 },
  { name: 'delete_module', x86_64: 176, aarch64: 106 },
  { name: 'kexec_load', x86_64: 246, aarch64: 104 },
  { name: 'kexec_file_load', x86_64: 320, aarch64: 294 },
  { name: 'reboot', x86_64: 169, aarch64: 142 },
  { name: 'swapon', x86_64: 167, aarch64: 224 },
  { name: 'swapoff', x86_64: 168, aarch64: 225 },
  { name: 'iopl', x86_64: 172, aarch64: null },
  { name: 'ioperm', x86_64: 173, aarch64: null },
  { name: 'acct', x86_64: 163, aarch64: 89 },
  { name: 'chroot', x86_64: 161, aarch64: 51 },
  { name: 'personality', x86_64: 135, aarch64: 92 },
  { name: 'open_tree', x86_64: 428, aarch64: 428 },
  { name: 'move_mount', x86_64: 429, aarch64: 429 },
  { name: 'fsopen', x86_64: 430, aarch64: 430 },
  { name: 'fsconfig', x86_64: 431, aarch64: 431 },
  { name: 'fsmount', x86_64: 432, aarch64: 432 },
  { name: 'fspick', x86_64: 433, aarch64: 433 },
  { name: 'mount_setattr', x86_64: 442, aarch64: 442 },
];

// x32 ABI compat syscalls on x86_64 use numbers 512-547 with bit 30 set in
// seccomp_data.nr; any 64-bit process can issue them, so the whole range is
// denied by one JGE rule instead of enumerating compat numbers.
const X32_COMPAT_MIN_NR = 512;

export function seccompArchFor(platformArch: string): SeccompArch | null {
  if (platformArch === 'x64') {
    return 'x86_64';
  }
  if (platformArch === 'arm64') {
    return 'aarch64';
  }
  return null;
}

export function deniedSyscallNumbers(arch: SeccompArch): readonly number[] {
  return DENIED_SYSCALLS.flatMap((entry) => {
    const nr = entry[arch];
    return nr === null ? [] : [nr];
  });
}

export function buildSeccompFilter(arch: SeccompArch): Uint8Array {
  return compile(arch, deniedSyscallNumbers(arch));
}

// bwrap applies --seccomp right before its own execve() of the sandboxed
// interpreter, so the kernel-stage filter must allow the exec family; the
// process-stage filter (seccomp-preload) closes exec after bun has booted.
const EXEC_FAMILY: readonly string[] = ['execve', 'execveat', 'fork', 'vfork'];

export function buildKernelSeccompFilter(arch: SeccompArch): Uint8Array {
  const denied = DENIED_SYSCALLS.flatMap((entry) =>
    EXEC_FAMILY.includes(entry.name) || entry[arch] === null ? [] : [entry[arch] as number],
  );
  return compile(arch, denied);
}

function compile(arch: SeccompArch, denied: readonly number[]): Uint8Array {
  const auditArch = arch === 'x86_64' ? AUDIT_ARCH_X86_64 : AUDIT_ARCH_AARCH64;
  const instructions = compileProgram(arch, auditArch, denied);
  return packProgram(instructions);
}

function compileProgram(
  arch: SeccompArch,
  auditArch: number,
  denied: readonly number[],
): Instruction[] {
  const denyIndex = 3 + (arch === 'x86_64' ? 2 : 0);
  const allowIndex = denyIndex + denied.length * 2;
  const program: Instruction[] = [
    { code: BPF_LD_ABS_WORD, jt: 0, jf: 0, k: 4 },
    { code: BPF_JEQ_K, jt: 0, jf: allowIndex - 1, k: auditArch },
    { code: BPF_LD_ABS_WORD, jt: 0, jf: 0, k: 0 },
  ];
  if (arch === 'x86_64') {
    program.push(
      { code: BPF_JGE_K, jt: 0, jf: 1, k: X32_COMPAT_MIN_NR },
      { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO_EPERM },
    );
  }
  for (const nr of denied) {
    program.push(
      { code: BPF_JEQ_K, jt: 0, jf: 1, k: nr },
      { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ERRNO_EPERM },
    );
  }
  program.push(
    { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_ALLOW },
    { code: BPF_RET_K, jt: 0, jf: 0, k: SECCOMP_RET_KILL_PROCESS },
  );
  return program;
}

interface Instruction {
  readonly code: number;
  readonly jt: number;
  readonly jf: number;
  readonly k: number;
}

function packProgram(instructions: readonly Instruction[]): Uint8Array {
  const packed = new Uint8Array(instructions.length * 8);
  const view = new DataView(packed.buffer);
  instructions.forEach((instruction, index) => {
    const offset = index * 8;
    view.setUint16(offset, instruction.code, true);
    view.setUint8(offset + 2, instruction.jt);
    view.setUint8(offset + 3, instruction.jf);
    view.setUint32(offset + 4, instruction.k, true);
  });
  return packed;
}

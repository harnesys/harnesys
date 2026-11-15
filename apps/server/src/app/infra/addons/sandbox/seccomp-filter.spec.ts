import { describe, expect, test } from 'bun:test';
import { bwrapCommand } from './launcher-linux.adapter.ts';
import {
  AUDIT_ARCH_AARCH64,
  AUDIT_ARCH_X86_64,
  buildKernelSeccompFilter,
  buildSeccompFilter,
  DENIED_SYSCALLS,
  deniedSyscallNumbers,
  seccompArchFor,
} from './seccomp-filter.ts';
import { buildSeccompPreload } from './seccomp-preload.ts';

const BPF_RET_K = 0x06;
const BPF_JEQ_K = 0x15;
const BPF_JGE_K = 0x35;
const BPF_LD_ABS_WORD = 0x20;
const X32_COMPAT_MIN_NR = 512;
const SECCOMP_RET_KILL_PROCESS = 0x80000000;
const SECCOMP_RET_ERRNO_EPERM = 0x00050000 | 1;
const SECCOMP_RET_ALLOW = 0x7fff0000;

interface Instruction {
  readonly code: number;
  readonly jt: number;
  readonly jf: number;
  readonly k: number;
}

function unpack(filter: Uint8Array): Instruction[] {
  const view = new DataView(filter.buffer, filter.byteOffset, filter.byteLength);
  const instructions: Instruction[] = [];
  for (let offset = 0; offset < filter.byteLength; offset += 8) {
    instructions.push({
      code: view.getUint16(offset, true),
      jt: view.getUint8(offset + 2),
      jf: view.getUint8(offset + 3),
      k: view.getUint32(offset + 4, true),
    });
  }
  return instructions;
}

function expectDenyProgram(
  filter: Uint8Array,
  denied: readonly number[],
  auditArch: number,
  extraErrnoRules: number,
): void {
  expect(filter.byteLength % 8).toBe(0);
  const instructions = unpack(filter);
  expect(instructions[0]).toEqual({ code: BPF_LD_ABS_WORD, jt: 0, jf: 0, k: 4 });
  expect(instructions[1]).toEqual({
    code: BPF_JEQ_K,
    jt: 0,
    jf: instructions.length - 3,
    k: auditArch,
  });
  const errnoReturns = instructions.filter(
    (instruction) => instruction.code === BPF_RET_K && instruction.k === SECCOMP_RET_ERRNO_EPERM,
  );
  expect(errnoReturns).toHaveLength(denied.length + extraErrnoRules);
  for (const nr of denied) {
    const jeq = instructions.findIndex(
      (instruction) => instruction.code === BPF_JEQ_K && instruction.k === nr,
    );
    expect(jeq).toBeGreaterThanOrEqual(0);
    expect(instructions[jeq + 1]).toEqual({
      code: BPF_RET_K,
      jt: 0,
      jf: 0,
      k: SECCOMP_RET_ERRNO_EPERM,
    });
  }
  expect(instructions.at(-1)).toEqual({
    code: BPF_RET_K,
    jt: 0,
    jf: 0,
    k: SECCOMP_RET_KILL_PROCESS,
  });
  expect(instructions.at(-2)).toEqual({
    code: BPF_RET_K,
    jt: 0,
    jf: 0,
    k: SECCOMP_RET_ALLOW,
  });
}

describe('seccomp filter', () => {
  test('arch mapping is fail-closed on unknown platforms', () => {
    expect(seccompArchFor('x64')).toBe('x86_64');
    expect(seccompArchFor('arm64')).toBe('aarch64');
    expect(seccompArchFor('win32')).toBeNull();
    expect(seccompArchFor('ppc64')).toBeNull();
  });

  test('x86_64 process-stage filter: packed cBPF with arch kill, per-syscall EPERM and final allow', () => {
    const filter = buildSeccompFilter('x86_64');
    expectDenyProgram(filter, deniedSyscallNumbers('x86_64'), AUDIT_ARCH_X86_64, 1);
    const instructions = unpack(filter);
    const jge = instructions.findIndex(
      (instruction) => instruction.code === BPF_JGE_K && instruction.k === X32_COMPAT_MIN_NR,
    );
    expect(jge).toBe(3);
    expect(instructions[jge + 1]).toEqual({
      code: BPF_RET_K,
      jt: 0,
      jf: 0,
      k: SECCOMP_RET_ERRNO_EPERM,
    });
  });

  test('aarch64 process-stage filter mirrors the generic syscall table', () => {
    const filter = buildSeccompFilter('aarch64');
    expectDenyProgram(filter, deniedSyscallNumbers('aarch64'), AUDIT_ARCH_AARCH64, 0);
    expect(unpack(filter).some((instruction) => instruction.code === BPF_JGE_K)).toBe(false);
  });

  test('denied syscall numbers match the kernel tables', () => {
    expect(deniedSyscallNumbers('x86_64')).toContain(59); // execve
    expect(deniedSyscallNumbers('x86_64')).toContain(41); // socket
    expect(deniedSyscallNumbers('x86_64')).toContain(323); // userfaultfd
    expect(deniedSyscallNumbers('x86_64')).toContain(320); // kexec_file_load
    expect(deniedSyscallNumbers('x86_64')).not.toContain(273); // finit_module's aarch64 number
    expect(deniedSyscallNumbers('aarch64')).toContain(221); // execve
    expect(deniedSyscallNumbers('aarch64')).toContain(198); // socket
    expect(deniedSyscallNumbers('aarch64')).not.toContain(57); // fork does not exist on aarch64
    expect(deniedSyscallNumbers('aarch64')).not.toContain(172); // iopl does not exist on aarch64
    for (const entry of DENIED_SYSCALLS) {
      if (entry.name === 'fork' || entry.name === 'vfork') {
        expect(entry.aarch64).toBeNull();
      }
    }
  });

  test('tables differ where the kernel tables differ', () => {
    expect(buildSeccompFilter('x86_64')).not.toEqual(buildSeccompFilter('aarch64'));
    expect(buildSeccompFilter('x86_64').byteLength).not.toBe(
      buildSeccompFilter('aarch64').byteLength,
    );
  });

  test('kernel-stage filter allows the exec family so bwrap can exec bun', () => {
    const kernel = unpack(buildKernelSeccompFilter('x86_64'));
    const process = unpack(buildSeccompFilter('x86_64'));
    expect(kernel).toHaveLength(process.length - 8); // 4 exec-family rules removed
    const deniedKernel = deniedSyscallNumbers('x86_64').filter(
      (nr) => ![59, 322, 57, 58].includes(nr),
    );
    expectDenyProgram(buildKernelSeccompFilter('x86_64'), deniedKernel, AUDIT_ARCH_X86_64, 1);
    for (const nr of [59, 322, 57, 58]) {
      expect(
        kernel.some((instruction) => instruction.code === BPF_JEQ_K && instruction.k === nr),
      ).toBe(false);
    }
  });
});

describe('bwrap command', () => {
  const spec = {
    orgId: 'org-1',
    addonId: 'acme.ext',
    version: '1.0.0',
    packageRoot: '/pkg',
    command: ['bun', 'x.ts'],
    dataDir: '/data',
    platform: 1,
  } as const;

  test('hardening flags and seccomp fd wiring are present', () => {
    const argv = bwrapCommand(spec);
    for (const flag of [
      '--die-with-parent',
      '--new-session',
      '--unshare-user',
      '--unshare-pid',
      '--unshare-net',
      '--unshare-ipc',
      '--disable-userns',
      '--proc',
      '/proc',
      '--dev',
      '/dev',
    ]) {
      expect(argv).toContain(flag);
    }
    expect(argv.join(' ')).toContain('--cap-drop ALL');
    expect(argv.join(' ')).toContain('--ro-bind / /');
    expect(argv.join(' ')).toContain('--seccomp 3');
    expect(argv.join(' ')).toContain(`--bind ${spec.dataDir} ${spec.dataDir}`);
  });
});

describe('seccomp preload', () => {
  test('embeds the full filter and fails closed on prctl errors', () => {
    const filter = buildSeccompFilter('x86_64');
    const source = buildSeccompPreload(filter);
    const encoded = Buffer.from(filter).toString('base64');
    expect(source).toContain(`atob('${encoded}')`);
    expect(source).toContain('PR_SET_SECCOMP');
    expect(source).toContain("throw new Error('addon sandbox: prctl(PR_SET_SECCOMP) failed");
  });
});

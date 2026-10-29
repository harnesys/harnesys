import type { PathsConfig } from '../ports/paths.ts';
export interface ResolvedPaths {
  allow: string[];
  cwd: string;
  write: string[];
  threadDir?: string;
}
function intersectArrays(arrays: string[][]): string[] {
  if (arrays.length === 0) {
    return [];
  }
  if (arrays.length === 1) {
    return arrays[0] as string[];
  }
  let result = arrays[0] as string[];
  for (let i = 1; i < arrays.length; i++) {
    const next = arrays[i] as string[];
    result = result.filter((p) => next.some((n) => p.startsWith(n) || n.startsWith(p)));
  }
  return result;
}
export function resolvePaths(
  agentPaths?: PathsConfig,
  runtimePaths?: PathsConfig,
  sessionPaths?: PathsConfig,
): ResolvedPaths {
  const allowArrays: string[][] = [];
  if (agentPaths?.allow) {
    allowArrays.push(agentPaths.allow);
  }
  if (runtimePaths?.allow) {
    allowArrays.push(runtimePaths.allow);
  }
  if (sessionPaths?.allow) {
    allowArrays.push(sessionPaths.allow);
  }
  const allow = intersectArrays(allowArrays);
  if (allow.length === 0) {
    throw Object.assign(
      new Error('paths.allow is required and must not be empty — cannot allow entire disk'),
      { code: 'paths_allow_empty' },
    );
  }
  const cwd =
    sessionPaths?.cwd ?? agentPaths?.cwd ?? runtimePaths?.cwd ?? (allow[0] as string | undefined);
  if (!cwd) {
    throw new Error('cwd is required: provide via paths.cwd or allow list');
  }
  if (allow.length > 0 && !allow.some((a) => cwd.startsWith(a) || a.startsWith(cwd))) {
    throw new Error(`cwd "${cwd}" is not under any allowed path`);
  }
  const writeArrays: string[][] = [];
  if (agentPaths?.write) {
    writeArrays.push(agentPaths.write);
  }
  if (runtimePaths?.write) {
    writeArrays.push(runtimePaths.write);
  }
  if (sessionPaths?.write) {
    writeArrays.push(sessionPaths.write);
  }
  const write = writeArrays.length > 0 ? intersectArrays(writeArrays) : [];
  const threadDir =
    sessionPaths?.threadDir ?? agentPaths?.threadDir ?? runtimePaths?.threadDir ?? undefined;
  return threadDir === undefined ? { allow, cwd, write } : { allow, cwd, write, threadDir };
}

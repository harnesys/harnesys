export interface EnforceGateInput {
  enforce: boolean;
  level: string;
  closing: boolean;
  memoryWrites: number;
  steps: number;
  nudges: number;
  minSteps: number;
  maxNudges: number;
}
export function enforceNudge(input: EnforceGateInput): true | undefined {
  const fires =
    input.enforce === true &&
    input.level !== 'delegate' &&
    input.closing === false &&
    input.memoryWrites === 0 &&
    input.steps >= input.minSteps &&
    input.nudges < input.maxNudges;
  return fires ? true : undefined;
}

export interface ResolveRunCwdInput {
  orgId: string;
  threadId: string;
}

export abstract class RunCwdResolverPort {
  /**
   * Absolute directory the next run of this thread will use, or null when the
   * workspace cannot be resolved or does not exist. Never falls back to home or
   * to the server working directory.
   */
  abstract resolve(input: ResolveRunCwdInput): string | null;
}

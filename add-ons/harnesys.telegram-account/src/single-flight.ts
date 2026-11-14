export type SingleFlight<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;

export function createSingleFlight<Args extends unknown[], Result>(
  task: (...args: Args) => Promise<Result>,
): SingleFlight<Args, Result> {
  let inFlight: Promise<Result> | null = null;
  return (...args: Args): Promise<Result> => {
    if (inFlight !== null) {
      return inFlight;
    }
    const run = task(...args).finally(() => {
      inFlight = null;
    });
    inFlight = run;
    return run;
  };
}

import type { GitCommitSummary } from '@harnesys/studio-shared';

export interface GraphRow {
  sha: string;
  lane: number;
  before: boolean[];
  after: boolean[];
  incoming: number[];
  outgoing: number[];
}

export interface CommitGraph {
  rows: GraphRow[];
  lanes: number;
}

export function buildCommitGraph(commits: GitCommitSummary[]): CommitGraph {
  const lanes: Array<string | null> = [];
  const rows: GraphRow[] = [];
  let laneCount = 0;
  for (const commit of commits) {
    const before = lanes.map((value) => value !== null);
    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) {
      const free = lanes.indexOf(null);
      if (free === -1) {
        lanes.push(commit.sha);
        lane = lanes.length - 1;
      } else {
        lanes[free] = commit.sha;
        lane = free;
      }
    }
    const incoming: number[] = [];
    for (let index = 0; index < lanes.length; index += 1) {
      if (index !== lane && lanes[index] === commit.sha) {
        incoming.push(index);
        lanes[index] = null;
      }
    }
    const outgoing: number[] = [];
    const parents = commit.parents;
    if (parents.length === 0) {
      lanes[lane] = null;
    } else {
      lanes[lane] = parents[0] ?? null;
      for (const parent of parents.slice(1)) {
        let target = lanes.indexOf(parent);
        if (target === -1) {
          const free = lanes.findIndex((value, index) => value === null && index !== lane);
          if (free === -1) {
            lanes.push(parent);
            target = lanes.length - 1;
          } else {
            lanes[free] = parent;
            target = free;
          }
        }
        outgoing.push(target);
      }
    }
    const after = lanes.map((value) => value !== null);
    laneCount = Math.max(laneCount, before.length, after.length);
    rows.push({ sha: commit.sha, lane, before, after, incoming, outgoing });
  }
  return { rows, lanes: laneCount };
}

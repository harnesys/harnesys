import type { GraphRow } from '../model/source-control-graph';

const LANE_GAP = 14;
const ROW_HEIGHT = 56;
const LANE_COLORS = [
  'var(--status-warn)',
  'var(--status-info)',
  'var(--status-ok)',
  'var(--destructive)',
  '#b58cff',
  'var(--live)',
];

export function CommitGraph({ row, lanes }: { row: GraphRow; lanes: number }) {
  const width = Math.max(lanes, 1) * LANE_GAP + 6;
  const mid = ROW_HEIGHT / 2;
  const x = (lane: number) => lane * LANE_GAP + LANE_GAP / 2 + 2;
  const color = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];
  const beforeLanes = Array.from({ length: lanes }, (_, index) => index).filter(
    (index) => row.before[index] && !row.incoming.includes(index),
  );
  const afterLanes = Array.from({ length: lanes }, (_, index) => index).filter(
    (index) => row.after[index] && !row.outgoing.includes(index),
  );
  return (
    <svg
      className="h-14 shrink-0"
      width={width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${width} ${ROW_HEIGHT}`}
      aria-hidden="true"
    >
      {beforeLanes.map((lane) => (
        <line
          key={`b-${lane}`}
          x1={x(lane)}
          y1={0}
          x2={x(lane)}
          y2={mid}
          stroke={color(lane)}
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
      ))}
      {afterLanes.map((lane) => (
        <line
          key={`a-${lane}`}
          x1={x(lane)}
          y1={mid}
          x2={x(lane)}
          y2={ROW_HEIGHT}
          stroke={color(lane)}
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
      ))}
      {row.incoming.map((lane) => (
        <path
          key={`i-${lane}`}
          d={`M ${x(lane)} 0 L ${x(row.lane)} ${mid}`}
          stroke={color(lane)}
          strokeWidth={1.5}
          strokeOpacity={0.6}
          fill="none"
        />
      ))}
      {row.outgoing.map((lane) => (
        <path
          key={`o-${lane}`}
          d={`M ${x(row.lane)} ${mid} L ${x(lane)} ${ROW_HEIGHT}`}
          stroke={color(lane)}
          strokeWidth={1.5}
          strokeOpacity={0.6}
          fill="none"
        />
      ))}
      <circle
        cx={x(row.lane)}
        cy={mid}
        r={3.5}
        fill={color(row.lane)}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { CsvColumnKind, CsvSort } from '../model/csv-parse';

export function CsvTable({
  header,
  rows,
  columnKinds,
  sort,
  onSortToggle,
}: {
  header: string[];
  rows: string[][];
  columnKinds: CsvColumnKind[];
  sort: CsvSort | null;
  onSortToggle: (column: number) => void;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
        <tr>
          <th className="w-px border-b px-3 py-2 text-muted-foreground text-xs" scope="col">
            #
          </th>
          {header.map((cell, i) => (
            <CsvHeaderCell
              key={`${i}:${cell}`}
              label={cell}
              kind={columnKinds[i] ?? 'text'}
              sorted={sort?.column === i ? sort.direction : null}
              onClick={() => onSortToggle(i)}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr className="hover:bg-muted/40" key={rowIndex}>
            <td className="whitespace-nowrap border-b px-3 py-1.5 text-muted-foreground text-xs tabular-nums">
              {rowIndex + 1}
            </td>
            {row.map((cell, i) => (
              <td
                className={`max-w-[420px] truncate whitespace-nowrap border-b px-3 py-1.5 ${
                  columnKinds[i] === 'number' ? 'text-right tabular-nums' : ''
                } ${columnKinds[i] === 'date' ? 'tabular-nums' : ''}`}
                key={i}
                title={cell}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CsvHeaderCell({
  label,
  kind,
  sorted,
  onClick,
}: {
  label: string;
  kind: CsvColumnKind;
  sorted: 'asc' | 'desc' | null;
  onClick: () => void;
}) {
  let Icon = ChevronsUpDownIcon;
  if (sorted === 'asc') {
    Icon = ArrowUpIcon;
  } else if (sorted === 'desc') {
    Icon = ArrowDownIcon;
  }
  return (
    <th className="border-b px-0 py-0 text-left" scope="col">
      <button
        className={`flex w-full items-center gap-1.5 px-3 py-2 text-xs transition-colors hover:bg-accent ${
          kind === 'number' ? 'justify-end' : ''
        } ${sorted ? 'text-foreground' : 'text-muted-foreground'}`}
        onClick={onClick}
        type="button"
      >
        <span className="truncate" title={label}>
          {label}
        </span>
        <Icon className={`size-3 shrink-0 ${sorted ? '' : 'opacity-50'}`} />
      </button>
    </th>
  );
}

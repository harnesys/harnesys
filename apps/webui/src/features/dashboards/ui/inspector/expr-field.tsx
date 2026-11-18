import type { Expr } from '@harnesys/contracts';
import { JsonValueSchema } from '@harnesys/contracts';
import { useId } from 'react';
import { Input } from '@/shared/ui/input';

interface ExprFieldProps {
  label: string;
  value: Expr | undefined;
  options: string[];
  onChange: (value: Expr | undefined) => void;
}

export function exprToText(value: Expr | undefined): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** A bare string stays a `ref` shorthand; anything JSON-parseable becomes a literal Expr. */
export function parseExprText(raw: string): Expr | undefined {
  if (raw.trim() === '') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const json = JsonValueSchema.safeParse(parsed);
    return json.success ? json.data : raw;
  } catch {
    return raw;
  }
}

/**
 * One prop binding: a plain JSON literal or an Expr. The picker lists the roots
 * the expression language exposes; typing raw JSON covers everything else.
 */
export function ExprField({ label, value, options, onChange }: ExprFieldProps): React.ReactNode {
  const listId = useId();
  return (
    <div className="flex items-center gap-1">
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <Input
        value={exprToText(value)}
        placeholder="state.count | rows | {&quot;fn&quot;:&quot;count&quot;,...}"
        list={listId}
        onChange={(event) => onChange(parseExprText(event.target.value))}
        className="h-6 flex-1 font-mono text-[11px]"
        aria-label={label}
      />
    </div>
  );
}

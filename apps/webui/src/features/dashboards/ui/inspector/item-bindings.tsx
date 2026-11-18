import type { Expr, WidgetItem } from '@harnesys/contracts';
import { LinkIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { PropFieldSpec } from '../../model/prop-fields';
import { ExprField } from './expr-field';

interface ItemBindingsEditorProps {
  item: WidgetItem;
  fields: PropFieldSpec[];
  options: string[];
  onChange: (bindings: Record<string, Expr>) => void;
}

function setBinding(
  bindings: Record<string, Expr>,
  key: string,
  value: Expr | undefined,
): Record<string, Expr> {
  const next = { ...bindings };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

/**
 * The single data-in mechanism: every prop of the descriptor can carry one
 * binding expression. Literal props stay in `item.props`; only `bindings`
 * reaches a prop at render time.
 */
export function ItemBindingsEditor({
  item,
  fields,
  options,
  onChange,
}: ItemBindingsEditorProps): React.ReactNode {
  const bound = fields.filter((field) => item.bindings[field.key] !== undefined);
  const unbound = fields.filter((field) => item.bindings[field.key] === undefined);
  return (
    <div className="flex flex-col gap-1.5">
      {fields.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70">
          This primitive takes no props; wire it through state and events.
        </p>
      ) : null}
      {bound.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <LinkIcon className="size-3" /> {field.label}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Unbind ${field.label}`}
              onClick={() => onChange(setBinding(item.bindings, field.key, undefined))}
            >
              <TrashIcon />
            </Button>
          </div>
          <ExprField
            label={`${field.label} binding`}
            value={item.bindings[field.key]}
            options={options}
            onChange={(value) => onChange(setBinding(item.bindings, field.key, value))}
          />
        </div>
      ))}
      {unbound.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {unbound.map((field) => (
            <Button
              key={field.key}
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] text-muted-foreground"
              onClick={() => onChange(setBinding(item.bindings, field.key, options[0] ?? ''))}
            >
              <PlusIcon className="size-3" /> {field.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

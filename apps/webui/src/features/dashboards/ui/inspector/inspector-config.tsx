import type { JsonValue } from '@harnesys/contracts';
import { propFieldSpecs } from '../../model/prop-fields';
import { PropField } from './prop-field';

interface PropEditorProps {
  primitive: string;
  props: Record<string, JsonValue>;
  options: string[];
  onChange: (props: Record<string, JsonValue>) => void;
}

/**
 * Item props form generated from the primitive descriptor: fields, labels,
 * hints, options, defaults and controls all come from the props schema metadata.
 */
export function PropEditor({
  primitive,
  props,
  options,
  onChange,
}: PropEditorProps): React.ReactNode {
  const fields = propFieldSpecs(primitive);
  const set = (key: string, value: JsonValue | undefined): void => {
    const next = { ...props };
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };
  if (fields.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/70">
        This primitive takes no props; connect it through bindings and events.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {fields.map((spec) => (
        <PropField
          key={spec.key}
          spec={spec}
          value={props[spec.key]}
          options={options}
          onCommit={(value) => set(spec.key, value)}
        />
      ))}
    </div>
  );
}

import type { JsonValue } from '@harnesys/contracts';
import type { PropFieldSpec } from '../../model/prop-fields';
import { ScalarField } from './field-control';
import { ListField } from './list-field';
import { RecordField } from './record-field';

interface PropFieldProps {
  spec: PropFieldSpec;
  value: JsonValue | undefined;
  options?: string[];
  onCommit: (value: JsonValue | undefined) => void;
}

/** One inspector field rendered from its descriptor schema and `.meta()` control. */
export function PropField({
  spec,
  value,
  options = [],
  onCommit,
}: PropFieldProps): React.ReactNode {
  if (spec.control === 'list') {
    return <ListField spec={spec} value={value} onChange={onCommit} />;
  }
  if (spec.control === 'record') {
    return <RecordField spec={spec} value={value} options={options} onChange={onCommit} />;
  }
  return <ScalarField spec={spec} value={value} onChange={onCommit} />;
}

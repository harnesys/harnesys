import type { Node } from 'harnesys';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ConcurrencyField, concurrencyString } from './agent-graph-concurrency-field';
import { GraphInput } from './agent-graph-input';

export type SpawnNode = Extract<Node, { type: 'control:spawn' }>;

export function SpawnNodeFields({
  node,
  onChange,
}: {
  node: SpawnNode;
  onChange: (node: Node) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="graph-spawn-calls">Calls (expr)</FieldLabel>
        <GraphInput
          id="graph-spawn-calls"
          value={node.calls}
          onChange={(event) =>
            onChange({
              ...node,
              type: 'control:spawn',
              calls: event.target.value,
            })
          }
        />
      </Field>
      <ConcurrencyField
        value={concurrencyString(node.concurrency)}
        onChange={(concurrency) => onChange({ ...node, type: 'control:spawn', concurrency })}
      />
      <Field>
        <FieldLabel htmlFor="graph-spawn-maxconcurrency">
          Max concurrent children (optional)
        </FieldLabel>
        <GraphInput
          id="graph-spawn-maxconcurrency"
          value={node.maxConcurrency !== undefined ? String(node.maxConcurrency) : ''}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (!raw) {
              const { maxConcurrency: _c, ...rest } = node;
              onChange({ ...rest, type: 'control:spawn' });
              return;
            }
            const n = Number(raw);
            if (Number.isInteger(n) && n >= 1) {
              onChange({ ...node, type: 'control:spawn', maxConcurrency: n });
            }
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="graph-spawn-timeout">Timeout ms (optional)</FieldLabel>
        <GraphInput
          id="graph-spawn-timeout"
          value={node.timeoutMs !== undefined ? String(node.timeoutMs) : ''}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (!raw) {
              const { timeoutMs: _t, onTimeout: _o, ...rest } = node;
              onChange({ ...rest, type: 'control:spawn' });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n) && n > 0) {
              onChange({ ...node, type: 'control:spawn', timeoutMs: n });
            }
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="graph-spawn-ontimeout">On timeout</FieldLabel>
        <Select
          value={node.onTimeout ?? 'partial'}
          onValueChange={(value) => {
            if (value !== 'fail' && value !== 'partial') {
              return;
            }
            onChange({ ...node, type: 'control:spawn', onTimeout: value });
          }}
        >
          <SelectTrigger id="graph-spawn-ontimeout" className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="partial">partial</SelectItem>
            <SelectItem value="fail">fail</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

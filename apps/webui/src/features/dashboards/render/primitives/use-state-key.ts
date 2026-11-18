import type { JsonValue } from '@harnesys/contracts';
import { STATE_KEY_PROP } from '@harnesys/contracts';
import { use } from 'react';
import { WidgetRuntimeContext } from '../runtime-context';
import { asString } from './coerce';

export interface StateKeyBinding {
  /** The widget runtime is present; an interactive primitive cannot work without it. */
  available: boolean;
  /** The runtime is present and the item names a key. */
  bound: boolean;
  /** Key named by the item, empty when unset. */
  key: string;
  /** Live value of the key, undefined when unbound. */
  value: unknown;
  /** Write the key when bound; a no-op otherwise. */
  set(value: JsonValue): void;
}

/** Live state binding of an interactive primitive, from its `stateKey` prop. */
export function useStateKeyProp(props: Record<string, unknown>): StateKeyBinding {
  const runtime = use(WidgetRuntimeContext);
  const key = asString(props[STATE_KEY_PROP]) ?? '';
  const bound = runtime !== null && key !== '';
  return {
    available: runtime !== null,
    bound,
    key,
    value: bound ? runtime.state[key] : undefined,
    set: (value) => {
      if (runtime !== null && key !== '') {
        runtime.setState(key, value);
      }
    },
  };
}

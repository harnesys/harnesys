import { Inject } from '../di/inject';
import { CONFIG } from './config-tokens';

export function Configuration(): ParameterDecorator {
  return Inject(CONFIG);
}

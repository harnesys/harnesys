import { Injectable } from '@harnesys/brix';
import { runShellProcess } from 'harnesys';
import {
  type TriggerScriptProcessInput,
  TriggerScriptProcessPort,
  type TriggerScriptProcessResult,
} from '../../../application/addons/triggers/trigger-script-process.port.ts';

@Injectable()
export class TriggerScriptProcessAdapter extends TriggerScriptProcessPort {
  override async run(input: TriggerScriptProcessInput): Promise<TriggerScriptProcessResult> {
    return await runShellProcess({
      command: input.script.command,
      ...(input.script.args === undefined
        ? {}
        : { argv: [input.script.command, ...input.script.args] }),
      shell: input.script.shell,
      cwd: input.cwd,
      env: scriptEnv(input.script.env, input.env),
      stdin: input.stdin,
      timeoutS: input.script.timeoutS,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  }
}

function scriptEnv(
  declared: Record<string, string> | undefined,
  harness: Record<string, string> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'LANG', 'TMPDIR']) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (declared !== undefined) {
    Object.assign(env, declared);
  }
  if (harness !== undefined) {
    Object.assign(env, harness);
  }
  return env;
}

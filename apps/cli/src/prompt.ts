import { createInterface } from 'node:readline/promises';

export function promptLine(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(label).finally(() => {
    rl.close();
  });
}

export async function promptSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return await promptLine(label);
  }
  return await readHidden(label);
}

function readHidden(label: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const state = { value: '' };
    const finish = (): void => {
      process.stdin.setRawMode?.(false);
      process.stdin.off('data', onData);
    };
    const onData = (chunk: unknown): void => {
      for (const char of String(chunk)) {
        if (applyChar(char)) {
          return;
        }
      }
    };
    const applyChar = (char: string): boolean => {
      if (char === '\r' || char === '\n') {
        finish();
        process.stdout.write('\n');
        resolve(state.value);
        return true;
      }
      if (char === '\u0003') {
        finish();
        process.stdout.write('\n');
        process.exit(1);
      }
      if (char === '\u007f') {
        state.value = state.value.slice(0, -1);
        return false;
      }
      state.value += char;
      return false;
    };
    process.stdin.on('data', onData);
  });
}

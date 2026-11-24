export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function credentialPluginCommand(flag: string, args: readonly string[]): string {
  const compiled = Bun.main.startsWith('/$bunfs/');
  const entry = compiled ? [process.execPath] : [process.execPath, Bun.main];
  return [...entry, flag, ...args].map(shellQuote).join(' ');
}

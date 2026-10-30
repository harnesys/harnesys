export const OLLAMA_DRIVERS = new Set(['ollama', 'ollama-cloud']);
export function isOllamaDriver(driver: string | undefined): boolean {
  return driver !== undefined && OLLAMA_DRIVERS.has(driver);
}

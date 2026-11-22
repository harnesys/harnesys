const RAW_REQUEST_NAME = /^\d{13}-[0-9a-f-]{36}\.json$/;

export function isThreadRawModelRequestName(name: string): boolean {
  return RAW_REQUEST_NAME.test(name);
}

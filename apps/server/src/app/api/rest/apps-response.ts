import { AppsException } from '../../domain/apps/errors.ts';

export async function appsResponse<T>(run: () => T | Promise<T>): Promise<T | Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppsException) {
      const body: Record<string, unknown> = { error: error.error };
      if (error.fields) {
        body.fields = error.fields;
      }
      if (error.holders) {
        body.holders = error.holders;
      }
      return Response.json(body, {
        status: error.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    throw error;
  }
}

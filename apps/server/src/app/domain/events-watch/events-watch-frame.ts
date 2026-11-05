export interface EventsWatchFrame {
  seq: number;
  topic: string;
  data: string;
}

export const KEEP_ALIVE_FRAME = ':\n\n';

export function serializeFrame(frame: EventsWatchFrame): string {
  return `id: ${frame.seq}\nevent: ${frame.topic}\ndata: ${frame.data}\n\n`;
}

import type { AddonLogLine } from '@harnesys/contracts';

const RING_LIMIT = 500;

export class AddonLogBuffer {
  private lines: AddonLogLine[] = [];

  push(line: AddonLogLine): AddonLogLine {
    this.lines.push(line);
    if (this.lines.length > RING_LIMIT) {
      this.lines = this.lines.slice(-RING_LIMIT);
    }
    return line;
  }

  tail(limit = 200): AddonLogLine[] {
    return this.lines.slice(-limit);
  }

  since(seq: number, limit = 200): AddonLogLine[] {
    return this.lines.filter((line) => line.seq > seq).slice(0, limit);
  }
}

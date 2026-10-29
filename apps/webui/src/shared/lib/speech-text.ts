export interface ChunkLimits {
  min?: number;
  max?: number;
}

interface ChunkSplit {
  complete: string[];
  tail: string;
}

const DEFAULT_MIN = 120;
const DEFAULT_MAX = 280;
const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/;
const COMMA_SPLIT = /(?<=,)/;

export function splitChunks(text: string, min: number): ChunkSplit {
  const complete: string[] = [];
  let current = '';
  for (const raw of text.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    if (sentence === '') {
      continue;
    }
    current = current === '' ? sentence : `${current} ${sentence}`;
    if (current.length >= min) {
      complete.push(current);
      current = '';
    }
  }
  return { complete, tail: current };
}

export function splitByMax(piece: string, max: number): string[] {
  if (piece.length <= max) {
    return [piece];
  }
  const parts: string[] = [];
  let current = '';
  for (const segment of piece.split(COMMA_SPLIT)) {
    for (const word of segment.split(' ')) {
      if (word === '') {
        continue;
      }
      if (current === '') {
        current = word;
      } else if (current.length + 1 + word.length <= max) {
        current = `${current} ${word}`;
      } else {
        parts.push(current);
        current = word;
      }
      while (current.length > max) {
        parts.push(current.slice(0, max));
        current = current.slice(max);
      }
    }
  }
  if (current !== '') {
    parts.push(current);
  }
  return parts;
}

export function chunkText(text: string, limits?: ChunkLimits): string[] {
  const min = limits?.min ?? DEFAULT_MIN;
  const max = limits?.max ?? DEFAULT_MAX;
  if (text.trim() === '') {
    return [];
  }
  const { complete, tail } = splitChunks(text, min);
  const chunks: string[] = [];
  for (const chunk of complete) {
    chunks.push(...splitByMax(chunk, max));
  }
  if (tail !== '') {
    chunks.push(...splitByMax(tail, max));
  }
  return chunks;
}

export function cleanTextForSpeech(text: string): string {
  let result = text.replace(/```[\s\S]*?```/g, ' ');
  result = result.replace(/`([^`]*)`/g, '$1');
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  result = result.replace(/https?:\/\/[^\s]+[^\s.,!?;:]/g, ' ');
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/\*([^*]+)\*/g, '$1');
  result = result.replace(/~~([^~]+)~~/g, '$1');
  result = result.replace(/^#{1,6}\s+/gm, '');
  result = result.replace(/\|/g, ' ');
  result = result.replace(/[ \t]+/g, ' ');
  result = result.replace(/ ([.,!?;:])/g, '$1');
  result = result.replace(/ ?\n ?/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

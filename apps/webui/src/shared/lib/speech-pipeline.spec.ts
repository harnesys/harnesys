import { describe, expect, test } from 'bun:test';
import type { SpeechEngine, SpeechHandle } from './speech-pipeline';
import { createSpeechPipeline } from './speech-pipeline';
import { chunkText, cleanTextForSpeech } from './speech-text';

interface FakeChunk {
  text: string;
  done: Promise<void>;
  pauseCount: number;
  resumeCount: number;
  resolve(): void;
}

interface FakeEngine extends SpeechEngine {
  chunks: FakeChunk[];
}

function createFakeEngine(): FakeEngine {
  const chunks: FakeChunk[] = [];
  return {
    chunks,
    prepare(text: string): SpeechHandle {
      let release: (() => void) | undefined;
      const done = new Promise<void>((resolve) => {
        release = resolve;
      });
      const chunk: FakeChunk = {
        text,
        done,
        pauseCount: 0,
        resumeCount: 0,
        resolve: () => {
          release?.();
        },
      };
      chunks.push(chunk);
      return {
        done,
        pause: () => {
          chunk.pauseCount += 1;
        },
        resume: () => {
          chunk.resumeCount += 1;
        },
      };
    },
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('chunkText', () => {
  test('splits sentences with min flush, max cap and long-sentence wrap', () => {
    expect(chunkText('   ')).toEqual([]);
    expect(chunkText('Hi. There.', { min: 120, max: 280 })).toEqual(['Hi. There.']);
    expect(
      chunkText('First sentence is here. Second sentence follows now. Third one.', {
        min: 22,
        max: 100,
      }),
    ).toEqual(['First sentence is here.', 'Second sentence follows now.', 'Third one.']);
    expect(chunkText('Aaaa bbbb cccc dddd.', { min: 5, max: 9 })).toEqual([
      'Aaaa bbbb',
      'cccc',
      'dddd.',
    ]);
    const text = 'word '.repeat(30).trim();
    const chunks = chunkText(text, { min: 10, max: 24 });
    expect(chunks.length).toBe(6);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(24);
    }
    expect(chunks.join(' ')).toBe(text);
  });
});

describe('cleanTextForSpeech', () => {
  test('strips markdown noise for speech', () => {
    const dirty = [
      'Intro **bold** and *italic* and ~~gone~~ with `cfg`.',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      'See [docs](https://example.com/a) or https://example.com/b.',
      '',
      '',
      '',
      '## Heading',
      '- item one',
      '| a | b |',
    ].join('\n');
    expect(cleanTextForSpeech(dirty)).toBe(
      'Intro bold and italic and gone with cfg.\n\nSee docs or.\n\nHeading\n- item one\na b',
    );
  });
});

describe('speech pipeline', () => {
  test('plays chunks in order with prefetch, pause/resume and stop', async () => {
    const engine = createFakeEngine();
    const pipeline = createSpeechPipeline(engine, { min: 4, max: 200 });
    expect(pipeline.status()).toBe('idle');

    pipeline.enqueue('Alpha beta. ');
    pipeline.enqueue('Gamma delta. ');
    pipeline.enqueue('Epsilon zeta. ');
    await tick();
    expect(pipeline.status()).toBe('active');
    expect(engine.chunks.length).toBe(2);
    expect(engine.chunks[0]?.text).toBe('Alpha beta.');
    expect(engine.chunks[1]?.text).toBe('Gamma delta.');
    expect(engine.chunks[0]?.resumeCount).toBe(1);
    expect(engine.chunks[1]?.pauseCount).toBe(1);

    pipeline.pause();
    expect(pipeline.status()).toBe('paused');
    expect(engine.chunks[0]?.pauseCount).toBe(2);
    pipeline.resume();
    expect(pipeline.status()).toBe('active');
    expect(engine.chunks[0]?.resumeCount).toBe(2);

    engine.chunks[0]?.resolve();
    await tick();
    expect(engine.chunks.length).toBe(3);
    expect(engine.chunks[2]?.text).toBe('Epsilon zeta.');
    expect(engine.chunks[1]?.resumeCount).toBe(1);
    expect(engine.chunks[2]?.pauseCount).toBe(1);

    pipeline.stop();
    expect(pipeline.status()).toBe('idle');
    engine.chunks[1]?.resolve();
    await tick();
    expect(pipeline.status()).toBe('idle');
    expect(engine.chunks.length).toBe(3);

    pipeline.enqueue('Zeta eta. ');
    expect(pipeline.status()).toBe('active');
    expect(engine.chunks.length).toBe(4);
    expect(engine.chunks[3]?.text).toBe('Zeta eta.');
    await tick();
    expect(engine.chunks[3]?.resumeCount).toBe(1);
    engine.chunks[3]?.resolve();
    await tick();
    expect(pipeline.status()).toBe('idle');
  });
});

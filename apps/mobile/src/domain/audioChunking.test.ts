import { describe, expect, it } from 'vitest';
import { createAudioChunkPlan } from './audioChunking';

describe('createAudioChunkPlan', () => {
  it('covers long audio without gaps and adds overlap only around boundaries', () => {
    const chunks = createAudioChunkPlan({ dataBytes: 25_000, bytesPerSecond: 10, chunkSeconds: 1_000, overlapSeconds: 2 });
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ mainStart: 0, mainEnd: 10_000, segmentStart: 0, segmentEnd: 10_020 });
    expect(chunks[1]).toEqual({ mainStart: 10_000, mainEnd: 20_000, segmentStart: 9_980, segmentEnd: 20_020 });
    expect(chunks[2]).toEqual({ mainStart: 20_000, mainEnd: 25_000, segmentStart: 19_980, segmentEnd: 25_000 });
  });
});

import { describe, expect, it } from 'vitest';
import { splitReviewSource } from './reviewChunking';

describe('review chunking', () => {
  it('keeps every character while limiting request size', () => {
    const source = ['A'.repeat(60), 'B'.repeat(60), 'C'.repeat(160)].join('\n\n');
    const chunks = splitReviewSource(source, 100);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join('').replace(/\n/g, '')).toBe(source.replace(/\n/g, ''));
  });

  it('returns no request for empty content', () => {
    expect(splitReviewSource('  \n\n ')).toEqual([]);
  });
});

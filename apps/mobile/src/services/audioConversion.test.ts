import { describe, expect, it } from 'vitest';
import { formatAudioConversionError } from './audioConversion';

describe('audio conversion errors', () => {
  it('turns low-level AAC open failures into an actionable message', () => {
    expect(formatAudioConversionError(new Error('Failed to open input file')))
      .toContain('无法解码这段录音');
  });

  it('keeps useful native decoder details', () => {
    expect(formatAudioConversionError(new Error('decoder unavailable')))
      .toBe('音频转换失败：decoder unavailable');
  });
});

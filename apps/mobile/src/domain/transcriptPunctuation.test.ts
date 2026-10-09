import { describe, expect, it } from 'vitest';
import { addLocalTerminalPunctuation, formatLocalTranscriptSegments } from './transcriptPunctuation';

describe('local transcript punctuation', () => {
  it('adds only terminal punctuation without removing filler words', () => {
    expect(addLocalTerminalPunctuation('嗯 然后我负责了部署')).toBe('嗯 然后我负责了部署。');
    expect(addLocalTerminalPunctuation('这个问题我分三点回答，')).toBe('这个问题我分三点回答。');
    expect(addLocalTerminalPunctuation('已经结束？')).toBe('已经结束？');
  });

  it('formats Whisper segments with seekable absolute timestamps', () => {
    expect(formatLocalTranscriptSegments([
      { text: '先介绍一下项目', t0: 50, t1: 200 },
      { text: '我主要负责交付', t0: 250, t1: 500 },
    ], 600_000)).toBe('[10:00] 先介绍一下项目。\n[10:02] 我主要负责交付。');
  });

  it('keeps timestamps that Whisper already reports as absolute', () => {
    expect(formatLocalTranscriptSegments([
      { text: '继续说', t0: 60_500, t1: 60_700 },
    ], 600_000)).toBe('[10:05] 继续说。');
  });
});

import { describe, expect, it } from 'vitest';
import { buildTranscriptEvidenceBlocks } from './transcriptEvidence';

describe('transcript evidence blocks', () => {
  it('preserves every character while splitting a long parent transcript', () => {
    const source = '面试官介绍流程候选人开始试讲'.repeat(80);
    const blocks = buildTranscriptEvidenceBlocks(source, 600);
    expect(blocks.length).toBeGreaterThan(5);
    expect(blocks.map((block) => block.text).join('')).toBe(source);
    expect(blocks.every((block) => block.parentId === 'transcript-root')).toBe(true);
  });

  it('keeps child block times ordered and bounded by the recording', () => {
    const blocks = buildTranscriptEvidenceBlocks('无标点长录音内容'.repeat(120), 900);
    expect(blocks[0].startSeconds).toBe(0);
    expect(blocks.at(-1)?.endSeconds).toBeLessThanOrEqual(900);
    expect(blocks.slice(1).every((block, index) => block.startSeconds >= blocks[index].endSeconds)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { TranscriptEvidenceBlock, TranscriptQaPair } from '../types';
import { calculateOrderedTextSimilarity, evaluateTranscriptOrganizationQuality } from './transcriptOrganizationQuality';

const evidence: TranscriptEvidenceBlock[] = Array.from({ length: 16 }, (_, index) => ({
  id: `b${index}`,
  parentId: 'transcript-root',
  parentSegmentIndex: index,
  speaker: '转写片段',
  text: `第${index + 1}段原文`,
  startSeconds: index * 200,
  endSeconds: index * 200 + 180,
  approximateTime: false,
}));

function buildCompletePairs(): TranscriptQaPair[] {
  return evidence.map((block, index) => ({
    id: `p${index}`,
    question: `议题 ${index + 1}`,
    startSeconds: block.startSeconds,
    endSeconds: block.endSeconds,
    confidence: 'medium',
    sourceSegmentIndexes: [index],
    evidenceBlockIds: [block.id],
    format: 'group-topic',
    turns: [{
      id: `t${index}`,
      speaker: index % 2 ? '候选人' : '面试官',
      text: block.text,
      role: index % 2 ? 'participant' : 'facilitator',
      startSeconds: block.startSeconds,
      sourceSegmentIndexes: [index],
      evidenceBlockIds: [block.id],
    }],
  }));
}

describe('transcript organization quality', () => {
  it('accepts complete, readable and time-distributed organization', () => {
    const quality = evaluateTranscriptOrganizationQuality(buildCompletePairs(), evidence, 3_200, 'group');
    expect(quality).toMatchObject({ passed: true, coverageRatio: 1, oversizedTurnCount: 0 });
    expect(quality.latestTimestampRatio).toBeGreaterThan(0.9);
  });

  it('rejects the previous failure shape: partial coverage at 00:00', () => {
    const quality = evaluateTranscriptOrganizationQuality(buildCompletePairs().slice(0, 1), evidence, 3_200, 'group');
    expect(quality.passed).toBe(false);
    expect(quality.issues).toContain('时间戳没有覆盖到录音后段');
    expect(quality.coverageRatio).toBe(1 / 16);
  });

  it('treats punctuation-only editing as faithful but rejects summaries', () => {
    expect(calculateOrderedTextSimilarity('嗯今天讲变量然后开始吧', '嗯，今天讲变量。然后开始吧！')).toBe(1);
    expect(calculateOrderedTextSimilarity('我负责需求沟通系统配置测试支持和上线推进', '我负责项目交付')).toBeLessThan(0.5);
  });
});

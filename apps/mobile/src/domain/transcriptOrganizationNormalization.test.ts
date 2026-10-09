import { describe, expect, it } from 'vitest';
import type { TranscriptEvidenceBlock, TranscriptQaPair } from '../types';
import { finalizeGroupTranscriptOrganization, normalizeGroupTurnRole } from './transcriptOrganizationNormalization';

const evidence: TranscriptEvidenceBlock[] = [
  { id: 'b0', parentId: 'transcript-root', parentSegmentIndex: 0, speaker: '转写片段', text: '同学们今天学习变量和输入输出结构。', startSeconds: 0, endSeconds: 50, approximateTime: false },
  { id: 'b1', parentId: 'transcript-root', parentSegmentIndex: 1, speaker: '转写片段', text: '我们来看一道编程题目。', startSeconds: 50, endSeconds: 100, approximateTime: false },
  { id: 'b2', parentId: 'transcript-root', parentSegmentIndex: 2, speaker: '转写片段', text: '我本科就读于计算机专业。', startSeconds: 100, endSeconds: 150, approximateTime: false },
];

const pair = (id: string, question: string, block: TranscriptEvidenceBlock, role: 'facilitator' | 'participant'): TranscriptQaPair => ({
  id, question, startSeconds: block.startSeconds, endSeconds: block.startSeconds, confidence: 'high',
  sourceSegmentIndexes: [block.parentSegmentIndex], evidenceBlockIds: [block.id], format: 'group-topic',
  turns: [{ id: `${id}-t`, speaker: role === 'facilitator' ? '面试官' : '候选人 1', text: block.text, role, startSeconds: block.startSeconds, sourceSegmentIndexes: [block.parentSegmentIndex], evidenceBlockIds: [block.id] }],
});

describe('group transcript finalization', () => {
  it('merges consecutive teaching fragments, fixes their role and restores real end time', () => {
    const result = finalizeGroupTranscriptOrganization([
      pair('p0', '开场与自我介绍', evidence[0], 'facilitator'),
      pair('p1', '试讲：变量', evidence[1], 'participant'),
      pair('p2', '自我介绍：候选人', evidence[2], 'participant'),
    ], evidence);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ question: '编程试讲与教学表达', startSeconds: 0, endSeconds: 100 });
    expect(result[0].turns?.every((turn) => turn.role === 'participant')).toBe(true);
  });

  it('adds omitted evidence back in chronological order', () => {
    const result = finalizeGroupTranscriptOrganization([pair('p2', '候选人自我介绍', evidence[2], 'participant')], evidence);
    expect(result.flatMap((item) => item.evidenceBlockIds)).toEqual(expect.arrayContaining(['b0', 'b1', 'b2']));
    expect(result[0].startSeconds).toBe(0);
  });

  it('recognizes a candidate answer during a parent communication simulation', () => {
    expect(normalizeGroupTurnRole('facilitator', '家长沟通场景模拟', '我理解您现在的心情，我们可以先分析孩子对课程的兴趣，再建议孩子完成一个小目标。')).toBe('participant');
  });
});

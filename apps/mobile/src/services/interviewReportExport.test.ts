import { describe, expect, it, vi } from 'vitest';
import { buildInterviewReportMarkdown } from './interviewReportExport';
import type { Interview, InterviewDraft } from '../types';

vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: {} } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));

const interview = {
  id: 1,
  jobId: 2,
  company: '示例科技',
  title: '前端工程师',
  round: '一面',
  startsAt: '2026-08-12 15:30',
  type: '现场',
} as Interview;

const draft = {
  reviewOverall: '表达清楚。',
  reviewStrengths: '项目证据充分。',
  reviewRisks: '边界说明不足。',
  reviewActionItems: ['补充失败案例'],
  reviewQuestionDetails: [],
  transcriptQaPairs: [{ id: 'q1', question: '介绍项目', answer: '负责核心模块。', startSeconds: 65, sourceSegmentIndexes: [], confidence: 'high' }],
  transcript: '',
  audioDurationMillis: 120000,
} as unknown as InterviewDraft;

describe('buildInterviewReportMarkdown', () => {
  it('exports summary and timestamped structured transcript', () => {
    const output = buildInterviewReportMarkdown({ interview, draft, result: '通过', content: 'all', includeTimestamps: true });
    expect(output).toContain('# 示例科技 · 一面');
    expect(output).toContain('## 复盘笔记');
    expect(output).toContain('- 补充失败案例');
    expect(output).toContain('### Q1. 介绍项目（01:05）');
  });

  it('can export transcript without timestamps', () => {
    const output = buildInterviewReportMarkdown({ interview, draft, result: '待反馈', content: 'transcript', includeTimestamps: false });
    expect(output).not.toContain('## 复盘笔记');
    expect(output).toContain('### Q1. 介绍项目');
    expect(output).not.toContain('01:05');
  });
});

import { describe, expect, it } from 'vitest';
import type { Interview, InterviewDraft } from '../types';
import { formatTranscriptionTaskStatus, getAttentionTranscriptionTasks } from './transcriptionTasks';

const interview = (id: number): Interview => ({
  id,
  jobId: id,
  company: `公司${id}`,
  title: '工程师',
  round: '一面',
  type: '视频',
  startsAt: '今天',
  status: '待复盘',
  audioState: '已录音',
  jdSummary: '',
  checklist: [],
});

const draft = (state: InterviewDraft['transcriptionState'], completed = 0, total = 0) => ({
  transcriptionState: state,
  transcriptionCompletedParts: completed,
  transcriptionTotalParts: total,
  transcriptionUpdatedAt: '2026-07-30T10:00:00.000Z',
} as InterviewDraft);

describe('transcription task center', () => {
  it('shows only active or failed tasks and keeps active work first', () => {
    const tasks = getAttentionTranscriptionTasks(
      [interview(1), interview(2), interview(3)],
      { 1: draft('failed', 2, 4), 2: draft('completed', 4, 4), 3: draft('processing', 1, 4) },
    );
    expect(tasks.map((item) => item.interview.id)).toEqual([3, 1]);
  });

  it('makes resumable progress explicit', () => {
    expect(formatTranscriptionTaskStatus(draft('failed', 2, 4))).toBe('已保留 2/4 · 点击继续');
  });
});

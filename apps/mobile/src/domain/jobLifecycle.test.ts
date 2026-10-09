import { describe, expect, it } from 'vitest';
import { getJobLifecycleDates, isArchiveCandidate, isDateInRange, parseDateValue } from './jobLifecycle';
import type { Job } from '../types';

const job: Job = { id: 1, company: '测试公司', title: '工程师', platform: 'Boss直聘', city: '广州', status: 'ended', salary: '10K', tags: [], resume: '默认' };

describe('job lifecycle', () => {
  it('keeps import time separate from the application date', () => {
    const dates = getJobLifecycleDates({
      job,
      note: { applicationDate: '2025-03-10', recordDate: '2026-07-31' },
      events: [{ id: 1, jobId: 1, fromStatus: null, toStatus: 'ended', eventTime: '2026-01-01T08:00:00Z', note: '' }],
    });
    expect(dates.applied?.toISOString()).toContain('2025-03-10');
    expect(dates.activity?.toISOString()).toContain('2026-07-31');
  });

  it('uses interview and communication activity as the latest meaningful date', () => {
    const dates = getJobLifecycleDates({
      job,
      interviews: [{ id: 2, jobId: 1, company: '测试公司', title: '工程师', round: '一面', type: '现场', startsAt: '2026-05-20 15:30', status: '待反馈', audioState: '未录音', jdSummary: '', checklist: [] }],
      hrAnswers: [{ id: 'a', question: '问题', answer: '回答', strategy: '', evidence: [], caution: '', resumeName: '默认', createdAt: '2026-06-01T10:00:00Z' }],
    });
    expect(dates.activity?.toISOString()).toContain('2026-06-01');
  });

  it('supports quick and custom date ranges', () => {
    const now = new Date('2026-07-31T12:00:00');
    expect(isDateInRange(new Date('2026-07-15'), { preset: '30d', startDate: '', endDate: '' }, now)).toBe(true);
    expect(isDateInRange(new Date('2026-05-01'), { preset: '30d', startDate: '', endDate: '' }, now)).toBe(false);
    expect(isDateInRange(new Date('2025-12-31'), { preset: 'custom', startDate: '2025-01-01', endDate: '2025-12-31' }, now)).toBe(true);
    expect(isDateInRange(new Date('2025-06-01'), { preset: 'custom', startDate: '2025-12-31', endDate: '2025-01-01' }, now)).toBe(true);
  });

  it('only suggests archiving ended jobs after prolonged inactivity', () => {
    expect(isArchiveCandidate({ job, events: [{ id: 1, jobId: 1, fromStatus: 'offered', toStatus: 'ended', eventTime: '2025-01-01', note: '' }] }, new Date('2026-07-31'))).toBe(true);
    expect(isArchiveCandidate({ job: { ...job, status: 'interviewing' }, events: [] }, new Date('2026-07-31'))).toBe(false);
  });

  it('parses relative Chinese interview dates', () => {
    expect(parseDateValue('明天 15:30', new Date('2026-07-31T09:00:00'))?.getDate()).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { calculateMetrics } from './metrics';
import type { Interview, Job } from '../types';

const job = (id: number, status: Job['status']): Job => ({ id, status, company: `公司${id}`, title: '工程师', platform: 'Boss直聘', city: '长沙', salary: '10K', tags: [], resume: '默认' });
const interview = (id: number, jobId: number): Interview => ({ id, jobId, company: `公司${jobId}`, title: '工程师', round: '一面', type: '现场', startsAt: '今天 10:00', status: '待复盘', audioState: '未录音', jdSummary: '', checklist: [] });

describe('calculateMetrics', () => {
  it('uses unique job ids for interview conversion', () => {
    const result = calculateMetrics([job(1, 'applied'), job(2, 'offered')], [interview(1, 1), interview(2, 1)]);
    expect(result).toMatchObject({ applied: 2, responded: 2, interviewCount: 1, offered: 1, interviewRate: 50, offerRate: 50 });
  });

  it('returns zero rates without an applied base', () => {
    expect(calculateMetrics([job(1, 'interested')], [])).toMatchObject({ applied: 0, replyRate: 0, interviewRate: 0, offerRate: 0 });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fetch } from 'expo/fetch';

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class { async arrayBuffer() { return new Uint8Array([1]).buffer; } } }));

import {
  isLikelySamePosition,
  mergeRecognizedInterviews,
  mergeRecognizedJobs,
  recognizeRecruitmentScreenshots,
  type RecognizedInterviewRecord,
  type RecognizedJobRecord,
} from './screenshotOcr';

function job(patch: Partial<RecognizedJobRecord>): RecognizedJobRecord {
  return {
    company: '熊猫优福', title: 'B端福利销售顾问', platform: 'Boss直聘', city: '', salary: '', tags: [],
    status: 'responded', recordDate: '', recordTime: '', recordGroup: '', contactMethod: '', recruiterName: '',
    recruiterTitle: '', recruitmentState: '', experience: '', education: '', companySize: '', industry: '', workMode: '',
    benefits: [], jdSummary: '', sourceFile: 'list.jpg', confidence: {}, ...patch,
  };
}

function interview(patch: Partial<RecognizedInterviewRecord>): RecognizedInterviewRecord {
  return {
    company: '瞬康科技', title: 'FDE前线工程师/前置部署工程师', salary: '', city: '', round: '面试', type: '',
    startsAt: '', status: '待面试', contactName: '', contactTitle: '', address: '', notes: '', jdSummary: '',
    sourceFile: 'interviews.jpg', confidence: {}, ...patch,
  };
}

describe('mergeRecognizedJobs', () => {
  it('combines list metadata with the longer JD detail from another screenshot', () => {
    const [merged] = mergeRecognizedJobs([
      job({ city: '广州 天河区', salary: '12-18K', recordDate: '7月29日', recruiterName: '李女士' }),
      job({ experience: '经验不限', education: '大专', companySize: '100-499人', benefits: ['双休', '带薪年假'], jdSummary: '负责B端客户开发。跟进订单回款并维护客户关系。' }),
    ]);
    expect(merged).toMatchObject({ city: '广州 天河区', salary: '12-18K', experience: '经验不限', education: '大专' });
    expect(merged.benefits).toEqual(['双休', '带薪年假']);
    expect(merged.jdSummary).toContain('跟进订单回款');
  });

  it('keeps a stopped-recruiting state when screenshots disagree', () => {
    const [merged] = mergeRecognizedJobs([job({ status: 'responded' }), job({ status: 'ended' })]);
    expect(merged.status).toBe('ended');
  });
});

describe('mergeRecognizedInterviews', () => {
  it('combines a truncated history card with interview details', () => {
    const records = mergeRecognizedInterviews([
      interview({ title: 'FDE前线工程师/前置部署工...', startsAt: '7月17日 15:30', status: '待反馈' }),
      interview({ type: '现场', contactName: '容女士', contactTitle: 'HR', address: '广州番禺区天安节能科技园', notes: '携带电脑演示' }),
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: '待反馈', type: '现场', contactName: '容女士' });
  });

  it('does not associate different roles from the same company', () => {
    expect(isLikelySamePosition(interview({ title: '前端工程师' }), interview({ title: '销售经理' }))).toBe(false);
  });

  it('tolerates a short OCR error in a distinctive title', () => {
    expect(isLikelySamePosition(
      interview({ title: 'FDE年前部署工程师' }),
      interview({ title: 'FDE前线工程师/前置部署工程师' }),
    )).toBe(true);
  });
});

describe('recognizeRecruitmentScreenshots', () => {
  it('starts up to two image requests concurrently', async () => {
    const releases: Array<() => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => {
      releases.push(() => resolve({
        ok: true,
        status: 200,
        text: async () => '{"jobs":[],"interviews":[]}',
      } as never));
    }));

    const request = recognizeRecruitmentScreenshots({
      files: [
        { uri: 'file:///one.jpg', name: 'one.jpg' },
        { uri: 'file:///two.jpg', name: 'two.jpg' },
      ],
      settings: {
        transcriptionProvider: 'local-whisper', transcriptionUrl: '', transcriptionModel: '', tencentEngineType: '',
        reviewUrl: '', reviewModel: '', ocrUrl: 'https://example.com/v1', ocrModel: 'vision-model',
      },
      apiKey: 'test-key',
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    releases.forEach((release) => release());
    await expect(request).resolves.toEqual({ jobs: [], interviews: [] });
  });
});

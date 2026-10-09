import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

import { buildJobResearchQuery, parseResearchSources, parseResearchSummary, searchJobResearch } from './jobResearch';

const job = { id: 1, company: '瞬康科技', title: 'FDE 前置部署工程师', platform: 'Boss直聘', city: '广州', status: 'interviewing' as const, salary: '8-12K', tags: [], resume: '默认' };

describe('job research', () => {
  beforeEach(() => fetchMock.mockReset());

  it('builds a query from the current job and research purpose', () => {
    expect(buildJobResearchQuery(job, 'risk')).toContain('瞬康科技 FDE 前置部署工程师 广州');
    expect(buildJobResearchQuery(job, 'risk')).toContain('试用期');
  });

  it('uses a specific user question without dropping the job context', () => {
    expect(buildJobResearchQuery(job, 'role', '是否需要长期驻场')).toBe('瞬康科技 FDE 前置部署工程师 广州 是否需要长期驻场');
  });

  it('parses and deduplicates search sources', () => {
    expect(parseResearchSources({ data: [
      { title: '面经', url: 'https://www.nowcoder.com/a', content: '技术面问题' },
      { title: '重复', url: 'https://www.nowcoder.com/a', content: '重复内容' },
      { title: '讨论', url: 'https://www.zhihu.com/question/1', description: '公司评价' },
    ] })).toEqual([
      expect.objectContaining({ title: '面经', site: '牛客' }),
      expect.objectContaining({ title: '讨论', site: '知乎' }),
    ]);
  });

  it('uses the Jina search endpoint without exposing the key in the request body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ title: '结果', url: 'https://example.com/a', content: '正文' }] }) });
    await expect(searchJobResearch({ job, preset: 'interview', apiKey: 'jina_secret' })).resolves.toMatchObject({ sources: [{ title: '结果' }] });
    expect(fetchMock).toHaveBeenCalledWith('https://s.jina.ai/', expect.objectContaining({ method: 'POST' }));
    const request = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string>; body?: string };
    expect(request.headers?.Authorization).toBe('Bearer jina_secret');
    expect(request.body).not.toContain('jina_secret');
  });

  it('requires structured model output', () => {
    expect(parseResearchSummary('{"overview":"存在两条重复反馈","riskSignals":["驻场频繁"],"positiveSignals":[],"interviewClues":["关注部署"],"actions":["向 HR 核实"],"caveat":"样本有限"}')).toMatchObject({
      overview: '存在两条重复反馈',
      riskSignals: ['驻场频繁'],
      caveat: '样本有限',
    });
  });
});

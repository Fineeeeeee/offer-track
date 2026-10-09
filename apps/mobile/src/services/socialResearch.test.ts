import { describe, expect, it } from 'vitest';
import { buildSocialResearchQuery, buildSocialResearchUrl, createResearchItem, detectResearchSource } from './socialResearch';

const job = { id: 1, company: '瞬康科技', title: 'FDE工程师', platform: 'Boss直聘', city: '广州', status: 'interviewing' as const, salary: '10K', tags: [], resume: '默认' };

describe('social research', () => {
  it('builds platform searches from the current job context', () => {
    const query = buildSocialResearchQuery(job, '是否长期驻场');
    expect(query).toContain('瞬康科技 FDE工程师');
    expect(decodeURIComponent(buildSocialResearchUrl('xiaohongshu', query))).toContain('是否长期驻场');
  });

  it('detects the source and creates a persistent research item', () => {
    expect(detectResearchSource('https://www.nowcoder.com/discuss/1')).toBe('nowcoder');
    expect(createResearchItem({ url: 'https://www.zhihu.com/question/1', title: '', note: '需要核实', now: new Date('2026-07-31T12:00:00Z') })).toMatchObject({
      source: 'zhihu',
      title: '知乎',
      note: '需要核实',
    });
  });

  it('rejects non-web links', () => {
    expect(() => createResearchItem({ url: 'javascript:alert(1)', title: '', note: '' })).toThrow('http');
  });
});

import { describe, expect, it } from 'vitest';
import { buildPreparationRecommendations, excludeExistingRecommendations } from './preparationRecommendations';

describe('preparation recommendations', () => {
  it('uses JD responsibilities and role keywords to build focused materials', () => {
    const recommendations = buildPreparationRecommendations({
      jobTitle: 'AI 解决方案 FDE',
      interviewTitle: '部署工程师',
      round: '技术一面',
      tags: ['RAG', '客户交付'],
      jdSummary: '负责大模型应用的客户现场部署与验收。定位线上故障并推动问题闭环。',
    });

    expect(recommendations.map((item) => item.kind)).toEqual(['role', 'project', 'technical', 'questions']);
    expect(recommendations[1].body).toContain('客户现场部署与验收');
    expect(recommendations[2].body).toContain('AI / 大模型');
    expect(recommendations[2].body).toContain('交付 / 部署');
  });

  it('does not suggest a material that was already added', () => {
    const recommendations = buildPreparationRecommendations({
      jobTitle: '前端工程师',
      interviewTitle: '',
      round: '一面',
      tags: [],
      jdSummary: '',
    });
    const remaining = excludeExistingRecommendations(recommendations, [
      { id: '1', kind: 'role', title: '前端工程师岗位拆解', body: '已编辑', importance: 'high' },
    ]);

    expect(remaining.some((item) => item.kind === 'role')).toBe(false);
    expect(remaining.length).toBe(recommendations.length - 1);
  });
});

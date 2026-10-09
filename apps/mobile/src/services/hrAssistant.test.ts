import { describe, expect, it, vi } from 'vitest';

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
import { buildHrAnswerPrompt, parseHrAnswerSuggestion } from './hrAssistant';

describe('hrAssistant', () => {
  it('builds a grounded prompt with resume and JD context', () => {
    const prompt = buildHrAnswerPrompt({
      question: '有 ToB 销售经验吗？',
      job: { id: 1, company: '熊猫优福', title: 'B端福利销售顾问', platform: 'Boss直聘', city: '广州', status: 'responded', salary: '12-18K', tags: ['ToB'], resume: '销售版' },
      note: { jdSummary: '维护企业客户', workMode: '', direction: '', companySize: '', experience: '', education: '', intentScore: '', sourceConfidence: '', screenshotName: '', applicationSource: '', recordGroup: '', contactMethod: '', recruiterName: '', applicationDate: '', recordDate: '', recordTime: '', recruitmentState: '', endReason: '', jobUrl: '', nextAction: '', note: '', offerBaseSalary: '', offerBonus: '', offerTotalPackage: '', offerProbation: '', offerStartDate: '', offerBenefits: '', offerRisks: '', offerNegotiation: '', offerDecision: '' },
      resume: { id: 1, name: '销售版', targetRole: '销售顾问', keywords: ['客户维护'], fileName: '', content: '负责企业客户回访。' },
    });
    expect(prompt).toContain('有 ToB 销售经验吗？');
    expect(prompt).toContain('维护企业客户');
    expect(prompt).toContain('负责企业客户回访');
    expect(prompt).toContain('不得补造');
  });

  it('parses fenced JSON and keeps evidence', () => {
    expect(parseHrAnswerSuggestion('```json\n{"answer":"您好，我有企业客户回访经验。","strategy":"直接回应","evidence":["企业客户回访"],"caution":"未说明销售年限"}\n```')).toEqual({
      answer: '您好，我有企业客户回访经验。',
      strategy: '直接回应',
      evidence: ['企业客户回访'],
      caution: '未说明销售年限',
    });
  });
});

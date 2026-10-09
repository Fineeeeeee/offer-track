import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '' } }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));

import { buildJobHuntWorkbook } from './excelExport';

describe('job hunt workbook', () => {
  it('exports linked job, interview, progress, and review data into three sheets', () => {
    const workbook = buildJobHuntWorkbook({
      jobs: [{ id: 1, company: '瞬康科技', title: 'FDE前线工程师', platform: 'Boss直聘', city: '广州', status: 'interviewing', salary: '8-12K', tags: [], resume: 'FDE简历' }],
      interviews: [{ id: 2, jobId: 1, company: '瞬康科技', title: 'FDE前线工程师', round: '一面', type: '现场', startsAt: '2026-07-17 15:30', status: '待反馈', audioState: '已转写', jdSummary: '负责客户现场部署', checklist: ['确认时间', '准备项目'] }],
      jobNotes: { 1: { workMode: '现场', nextAction: '等待反馈', jdSummary: '负责客户现场部署', note: '面试地址：广州番禺区' } as never },
      jobEvents: {},
      interviewDrafts: { 2: { interviewerName: '容女士', interviewerTitle: 'HR', transcript: '面试转写', reviewOverall: '整体匹配', reviewStrengths: '项目经验', reviewRisks: '表达偏长', reviewProgressComparedWithPast: '结构更清楚', reviewRecurringPatterns: ['证据不足'], recordMarkers: [], preparationMaterials: [] } as never },
      interviewResults: { 2: '待反馈' },
      interviewChecklistDone: { 2: { 确认时间: true } },
    });

    expect(workbook.SheetNames).toEqual(['求职进度', '面试记录', '面试复盘']);
    const progress = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['求职进度'])[0];
    const interview = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['面试记录'])[0];
    const review = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['面试复盘'])[0];
    expect(progress).toMatchObject({ 公司名称: '瞬康科技', 面试次数: 1, 下一步: '等待反馈' });
    expect(interview).toMatchObject({ 面试官: '容女士', 准备完成: 1, 准备总数: 2, 关联职位状态: '面试中' });
    expect(review).toMatchObject({ 转写文本: '面试转写', 总体判断: '整体匹配', 主要风险: '表达偏长', 相比以往: '结构更清楚', 重复模式: '证据不足' });
  });
});

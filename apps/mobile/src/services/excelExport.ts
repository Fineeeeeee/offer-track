import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import type {
  ApplicationEvent,
  Interview,
  InterviewDraft,
  InterviewResult,
  Job,
  JobNote,
} from '../types';

type ExcelExportInput = {
  jobs: Job[];
  interviews: Interview[];
  jobNotes: Record<number, JobNote>;
  jobEvents: Record<number, ApplicationEvent[]>;
  interviewDrafts: Record<number, InterviewDraft>;
  interviewResults: Record<number, InterviewResult>;
  interviewChecklistDone: Record<number, Record<string, boolean>>;
};

export async function exportJobHuntWorkbook(input: ExcelExportInput) {
  const workbook = buildJobHuntWorkbook(input);
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer;
  const date = new Date();
  const fileName = `OfferJing-求职记录-${formatDate(date)}.xlsx`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(new Uint8Array(data));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing-unavailable');
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: '导出求职面试记录表',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}

export function buildJobHuntWorkbook(input: ExcelExportInput) {
  const workbook = XLSX.utils.book_new();
  const progressSheet = XLSX.utils.json_to_sheet(buildProgressRows(input));
  const interviewSheet = XLSX.utils.json_to_sheet(buildInterviewRows(input));
  const reviewSheet = XLSX.utils.json_to_sheet(buildReviewRows(input));

  configureSheet(progressSheet, [6, 18, 24, 12, 14, 14, 14, 12, 12, 10, 18, 28, 10, 18, 12, 12, 10, 16, 24, 14, 36, 36, 36]);
  configureSheet(interviewSheet, [6, 18, 24, 12, 18, 12, 12, 16, 16, 12, 12, 12, 12, 18, 32, 14]);
  configureSheet(reviewSheet, [18, 24, 12, 36, 40, 40, 40, 40, 36, 36, 40, 60, 40, 40, 40, 40, 30]);

  XLSX.utils.book_append_sheet(workbook, progressSheet, '求职进度');
  XLSX.utils.book_append_sheet(workbook, interviewSheet, '面试记录');
  XLSX.utils.book_append_sheet(workbook, reviewSheet, '面试复盘');
  return workbook;
}

function buildProgressRows({ jobs, interviews, jobNotes, jobEvents, interviewResults }: ExcelExportInput) {
  return jobs.map((job, index) => {
    const note = jobNotes[job.id];
    const linkedInterviews = interviews.filter((interview) => interview.jobId === job.id);
    const latestInterview = linkedInterviews[0];
    const latestEvent = jobEvents[job.id]?.[0];
    return {
      序号: index + 1,
      公司名称: job.company,
      应聘岗位: job.title,
      当前状态: statusLabel(job.status),
      平台来源: job.platform,
      城市: job.city,
      薪资: job.salary,
      工作方式: note?.workMode ?? '',
      公司规模: note?.companySize ?? '',
      意向度: note?.intentScore ?? '',
      简历版本: job.resume,
      下一步: note?.nextAction ?? '',
      面试次数: linkedInterviews.length,
      最近面试时间: latestInterview?.startsAt ?? '',
      最近面试形式: latestInterview?.type ?? '',
      最近面试结果: latestInterview ? interviewResults[latestInterview.id] ?? '待反馈' : '',
      是否有Offer: job.status === 'offered' ? '是' : '否',
      Offer总包: note?.offerTotalPackage ?? '',
      Offer决策: note?.offerDecision ?? '',
      结束原因: note?.endReason ?? '',
      JD摘要: note?.jdSummary ?? '',
      跟进备注: note?.note ?? '',
      最近更新: latestEvent ? `${latestEvent.eventTime} ${latestEvent.note}` : '',
    };
  });
}

function buildInterviewRows({
  interviews,
  jobs,
  interviewDrafts,
  interviewResults,
  interviewChecklistDone,
}: ExcelExportInput) {
  return interviews.map((interview, index) => {
    const draft = interviewDrafts[interview.id];
    const checklistDone = interviewChecklistDone[interview.id] ?? {};
    const linkedJob = jobs.find((job) => job.id === interview.jobId);
    return {
      序号: index + 1,
      公司名称: interview.company,
      应聘岗位: interview.title,
      面试轮次: interview.round,
      面试时间: interview.startsAt,
      面试形式: interview.type,
      面试状态: interview.status,
      面试官: draft?.interviewerName ?? '',
      面试官职位: draft?.interviewerTitle ?? '',
      录音状态: interview.audioState,
      面试结果: interviewResults[interview.id] ?? '待反馈',
      准备完成: Object.values(checklistDone).filter(Boolean).length,
      准备总数: interview.checklist.length,
      提醒时间: draft?.reminderAt ?? '',
      后续动作: draft?.followUpAction ?? '',
      关联职位状态: linkedJob ? statusLabel(linkedJob.status) : '',
    };
  });
}

function buildReviewRows({ interviews, interviewDrafts }: ExcelExportInput) {
  return interviews.map((interview) => {
    const draft = interviewDrafts[interview.id];
    return {
      公司名称: interview.company,
      应聘岗位: interview.title,
      面试轮次: interview.round,
      JD摘要: interview.jdSummary,
      自我介绍: draft?.selfIntroduction ?? '',
      项目案例: draft?.projectStories ?? '',
      公司研究: draft?.companyResearch ?? '',
      岗位理解: draft?.roleUnderstanding ?? '',
      准备清单: interview.checklist.join('\n'),
      反问与关注点: draft?.questionsForInterviewer ?? '',
      面试问题: draft?.manualQuestions ?? '',
      转写文本: draft?.transcript ?? '',
      总体判断: draft?.reviewOverall ?? '',
      核心优点: draft?.reviewStrengths ?? '',
      主要风险: draft?.reviewRisks ?? '',
      相比以往: draft?.reviewProgressComparedWithPast ?? '',
      重复模式: draft?.reviewRecurringPatterns.join('\n') ?? '',
      复盘备注: draft?.note ?? '',
      改进回答: draft?.improvedAnswer ?? '',
      录音标记: draft?.recordMarkers.join('\n') ?? '',
    };
  });
}

function configureSheet(sheet: XLSX.WorkSheet, widths: number[]) {
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  if (sheet['!ref']) {
    sheet['!autofilter'] = { ref: sheet['!ref'] };
  }
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusLabel(status: Job['status']) {
  const labels: Record<Job['status'], string> = {
    interested: '感兴趣',
    preparing: '准备中',
    applied: '已投递',
    responded: '已回复',
    interviewing: '面试中',
    offered: '已录用',
    ended: '已结束',
  };
  return labels[status];
}

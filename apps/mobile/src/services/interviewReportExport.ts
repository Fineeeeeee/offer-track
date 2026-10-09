import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildTranscriptSegments } from '../domain/transcriptUtils';
import type { Interview, InterviewDraft, InterviewResult, Job } from '../types';

export type InterviewReportContent = 'summary' | 'transcript' | 'all';

type InterviewReportInput = {
  interview: Interview;
  draft: InterviewDraft;
  result: InterviewResult;
  job?: Job;
  content: InterviewReportContent;
  includeTimestamps: boolean;
};

export async function shareInterviewReport(input: InterviewReportInput) {
  const markdown = buildInterviewReportMarkdown(input);
  const fileName = `OfferJing-${sanitizeFileName(input.interview.company)}-${sanitizeFileName(input.interview.round)}.md`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(markdown);

  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持文件分享。');
  await Sharing.shareAsync(file.uri, {
    dialogTitle: '导出面试记录',
    mimeType: 'text/markdown',
    UTI: 'net.daringfireball.markdown',
  });
  return file.uri;
}

export function buildInterviewReportMarkdown({
  interview,
  draft,
  result,
  job,
  content,
  includeTimestamps,
}: InterviewReportInput) {
  const lines = [
    `# ${interview.company} · ${interview.round}`,
    '',
    `- 岗位：${interview.title || job?.title || '未设置'}`,
    `- 时间：${interview.startsAt || '未设置'}`,
    `- 形式：${interview.type || '未设置'}`,
    `- 结果：${result}`,
  ];

  if (content === 'summary' || content === 'all') {
    lines.push('', '## 复盘笔记');
    appendSection(lines, '总体判断', draft.reviewOverall);
    appendSection(lines, '核心优点', draft.reviewStrengths);
    appendSection(lines, '主要风险', draft.reviewRisks);
    if (draft.reviewActionItems.length) {
      lines.push('', '### 行动清单', ...draft.reviewActionItems.map((item) => `- ${item}`));
    }
    if (draft.reviewQuestionDetails.length) {
      lines.push('', '### 逐题复盘');
      draft.reviewQuestionDetails.forEach((item, index) => {
        lines.push('', `#### Q${index + 1}. ${item.question}（${item.score}/5）`);
        if (item.answerSummary) lines.push(item.answerSummary);
        if (item.feedback) lines.push('', `改进：${item.feedback}`);
        if (includeTimestamps && item.evidenceTime) lines.push('', `录音位置：${item.evidenceTime}`);
      });
    }
  }

  if (content === 'transcript' || content === 'all') {
    lines.push('', '## 对话记录');
    if (draft.transcriptQaPairs.length) {
      draft.transcriptQaPairs.forEach((pair, index) => {
        const time = includeTimestamps ? `（${formatSeconds(pair.startSeconds)}）` : '';
        if (pair.format === 'group-topic' && pair.turns?.length) {
          lines.push('', `### 议题 ${index + 1}. ${pair.question}${time}`);
          pair.turns.forEach((turn) => {
            const turnTime = includeTimestamps ? ` · ${formatSeconds(turn.startSeconds)}` : '';
            lines.push('', `**${turn.role === 'self' ? '我' : turn.speaker}${turnTime}**`, turn.text);
          });
        } else {
          lines.push('', `### Q${index + 1}. ${pair.question}${time}`, pair.answer || '未整理回答');
        }
      });
    } else {
      const segments = buildTranscriptSegments(draft.transcript, draft.audioDurationMillis / 1000);
      segments.forEach((segment) => {
        const prefix = includeTimestamps ? `**${segment.speaker} · ${segment.timeLabel}**` : `**${segment.speaker}**`;
        lines.push('', prefix, '', segment.text);
      });
      if (!segments.length) lines.push('', '暂无转写内容。');
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function appendSection(lines: string[], title: string, body: string) {
  if (!body.trim()) return;
  lines.push('', `### ${title}`, body.trim());
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 36) || '面试记录';
}

function formatSeconds(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

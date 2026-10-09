import { fetch } from 'expo/fetch';
import type { AiServiceSettings, Job, JobNote, ResumeVersion } from '../types';
import { resolveChatCompletionsUrl } from './apiEndpoint';
import { withRequestTimeout } from './requestTimeout';

export type HrAnswerSuggestion = {
  answer: string;
  strategy: string;
  evidence: string[];
  caution: string;
};

export async function generateHrAnswer({
  question,
  job,
  note,
  resume,
  settings,
  apiKey,
}: {
  question: string;
  job: Job;
  note: JobNote;
  resume: ResumeVersion;
  settings: AiServiceSettings;
  apiKey: string;
}): Promise<HrAnswerSuggestion> {
  requireValue(settings.reviewUrl, 'AI 服务 URL');
  requireValue(settings.reviewModel, 'AI 模型');
  requireValue(apiKey, 'API Key');
  requireValue(question, 'HR 问题');
  requireValue(resume.content, '简历正文');

  const response = await withRequestTimeout(90_000, (signal) => fetch(resolveChatCompletionsUrl(settings.reviewUrl), {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.reviewModel.trim(),
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是严谨的求职沟通助手。只能使用用户提供的简历和岗位信息，不得虚构经历、技术、年限、业绩、薪资或到岗时间。信息不足时使用诚实且积极的表达，并在 caution 中明确待用户确认的事实。只返回 JSON。',
        },
        { role: 'user', content: buildHrAnswerPrompt({ question, job, note, resume }) },
      ],
    }),
  }));
  const raw = await response.text();
  const payload = parseJsonText(raw);
  if (!response.ok) {
    throw new Error(readApiError(payload) || `回答生成失败（${response.status}）`);
  }
  const content =
    readPath(payload, ['choices', '0', 'message', 'content']) ||
    readPath(payload, ['output_text']) ||
    readPath(payload, ['text']);
  if (!content) throw new Error('AI 接口返回成功，但没有可读取的回答。');
  return parseHrAnswerSuggestion(content);
}

export function buildHrAnswerPrompt({
  question,
  job,
  note,
  resume,
}: {
  question: string;
  job: Job;
  note: JobNote;
  resume: ResumeVersion;
}) {
  return [
    '请为招聘软件聊天场景生成一段可直接发送给 HR 的中文回答。',
    '返回 JSON：{"answer":"可直接发送的回答","strategy":"回答思路","evidence":["使用到的简历事实"],"caution":"需要用户确认或不可承诺的内容；没有则为空"}',
    '要求：回答简洁自然，通常 50-180 字；先回应问题，再说明匹配证据；不要说“根据简历”；不得补造任何未提供的事实。',
    `HR 问题：${question.trim()}`,
    `公司：${job.company}`,
    `岗位：${job.title}`,
    `薪资与城市：${job.salary}；${job.city}`,
    `岗位标签：${job.tags.join('、')}`,
    `JD：\n${limitText(note.jdSummary, 12000) || '未提供'}`,
    `简历版本：${resume.name}；目标岗位：${resume.targetRole}`,
    `简历关键词：${resume.keywords.join('、')}`,
    `简历正文：\n${limitText(resume.content, 16000)}`,
  ].join('\n\n');
}

export function parseHrAnswerSuggestion(content: string): HrAnswerSuggestion {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let payload: unknown;
  try {
    payload = JSON.parse(normalized);
  } catch {
    throw new Error('AI 返回内容不是有效 JSON，请重试。');
  }
  if (!payload || typeof payload !== 'object') throw new Error('AI 返回结构无效。');
  const value = payload as Record<string, unknown>;
  const answer = asText(value.answer);
  if (!answer) throw new Error('AI 没有生成可用回答。');
  return {
    answer,
    strategy: asText(value.strategy),
    evidence: Array.isArray(value.evidence) ? value.evidence.map(asText).filter(Boolean).slice(0, 6) : [],
    caution: asText(value.caution),
  };
}

function limitText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function readApiError(payload: unknown) {
  return readPath(payload, ['error', 'message']) || readPath(payload, ['message']) || readPath(payload, ['raw']);
}

function readPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current.trim() : '';
}

function requireValue(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} 未填写。`);
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

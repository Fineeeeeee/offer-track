import { fetch } from 'expo/fetch';
import type { AiServiceSettings, Job, JobNote } from '../types';
import { resolveChatCompletionsUrl } from './apiEndpoint';
import { withRequestTimeout } from './requestTimeout';

export type JobResearchPreset = 'risk' | 'interview' | 'role' | 'tech';

export type JobResearchSource = {
  title: string;
  url: string;
  content: string;
  site: string;
  publishedAt: string;
};

export type JobResearchSummary = {
  overview: string;
  riskSignals: string[];
  positiveSignals: string[];
  interviewClues: string[];
  actions: string[];
  caveat: string;
};

export const jobResearchPresets: Array<{ value: JobResearchPreset; label: string }> = [
  { value: 'risk', label: '公司避雷' },
  { value: 'interview', label: '近期面经' },
  { value: 'role', label: '岗位实情' },
  { value: 'tech', label: '技术核验' },
];

export function buildJobResearchQuery(job: Job, preset: JobResearchPreset, question = '') {
  const subject = [job.company, job.title, job.city].filter(Boolean).join(' ');
  const suffix: Record<JobResearchPreset, string> = {
    risk: '避雷 加班 试用期 裁员 薪资拖欠 工作体验 小红书 脉脉 看准',
    interview: '面经 面试流程 面试题 技术面 HR面 牛客 小红书',
    role: '真实工作内容 工作强度 出差 驻场 发展空间 招聘评价',
    tech: '技术栈 研发团队 GitHub 开源项目 产品架构',
  };
  return `${subject} ${question.trim() || suffix[preset]}`.trim();
}

export async function searchJobResearch({
  job,
  preset,
  question = '',
  apiKey,
}: {
  job: Job;
  preset: JobResearchPreset;
  question?: string;
  apiKey: string;
}): Promise<{ query: string; sources: JobResearchSource[] }> {
  requireValue(apiKey, 'Jina Search API Key');
  const query = buildJobResearchQuery(job, preset, question);
  const response = await withRequestTimeout(90_000, (signal) => fetch('https://s.jina.ai/', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, count: 6, respondWith: 'json', timeout: 60 }),
  }));
  const raw = await response.text();
  const payload = parseJson(raw);
  if (!response.ok) throw new Error(readApiError(payload) || `在线搜索失败（${response.status}）`);
  const sources = parseResearchSources(payload);
  if (!sources.length) throw new Error('搜索接口没有返回可读取的来源。');
  return { query, sources };
}

export async function summarizeJobResearch({
  job,
  note,
  preset,
  question = '',
  sources,
  settings,
  apiKey,
  signal,
}: {
  job: Job;
  note: JobNote;
  preset: JobResearchPreset;
  question?: string;
  sources: JobResearchSource[];
  settings: AiServiceSettings;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<JobResearchSummary> {
  requireValue(settings.reviewUrl, 'AI 服务 URL');
  requireValue(settings.reviewModel, 'AI 模型');
  requireValue(apiKey, '复盘 API Key');
  const sourceText = sources.slice(0, 6).map((source, index) => [
    `[来源 ${index + 1}] ${source.title}`,
    `站点：${source.site}`,
    `地址：${source.url}`,
    limitText(source.content, 3500),
  ].join('\n')).join('\n\n');
  const response = await withRequestTimeout(90_000, (requestSignal) => fetch(resolveChatCompletionsUrl(settings.reviewUrl), {
    method: 'POST',
    signal: requestSignal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.reviewModel.trim(),
      temperature: 0.15,
      messages: [
        {
          role: 'system',
          content: '你是求职信息核验助手。严格区分事实、网友主观反馈和推测；不得把单一帖子视为事实，不得编造来源。只返回 JSON。',
        },
        {
          role: 'user',
          content: [
            `调研类型：${jobResearchPresets.find((item) => item.value === preset)?.label}`,
            question.trim() ? `用户关注：${question.trim()}` : '',
            `公司与岗位：${job.company} · ${job.title} · ${job.city}`,
            `岗位 JD：${limitText(note.jdSummary, 5000) || '未提供'}`,
            '请综合以下搜索来源。重复出现的说法才可描述为“多来源风险线索”；无法交叉验证时必须明确写“单一来源”。',
            '返回 JSON：{"overview":"总体观察","riskSignals":["风险线索"],"positiveSignals":["正面线索"],"interviewClues":["面试线索"],"actions":["下一步核验动作"],"caveat":"时效性与可信度提醒"}',
            sourceText,
          ].join('\n\n'),
        },
      ],
    }),
  }), signal);
  const raw = await response.text();
  const payload = parseJson(raw);
  if (!response.ok) throw new Error(readApiError(payload) || `调研整理失败（${response.status}）`);
  const content = readPath(payload, ['choices', '0', 'message', 'content']) || readPath(payload, ['output_text']);
  if (!content) throw new Error('AI 接口没有返回可读取的调研总结。');
  return parseResearchSummary(content);
}

export function parseResearchSources(payload: unknown): JobResearchSource[] {
  const root = asRecord(payload);
  const candidates = Array.isArray(root.data)
    ? root.data
    : Array.isArray(asRecord(root.data).data)
      ? asRecord(root.data).data as unknown[]
      : [];
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const item = asRecord(candidate);
    const url = asText(item.url) || asText(item.link);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{
      title: asText(item.title) || domainLabel(url),
      url,
      content: asText(item.content) || asText(item.description),
      site: domainLabel(url),
      publishedAt: asText(item.publishedAt) || asText(item.publishedTime) || asText(item.date),
    }];
  }).slice(0, 8);
}

export function parseResearchSummary(content: string): JobResearchSummary {
  const normalized = content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  let payload: unknown;
  try {
    payload = JSON.parse(normalized);
  } catch {
    throw new Error('AI 返回的调研总结不是有效 JSON。');
  }
  const value = asRecord(payload);
  const overview = asText(value.overview);
  if (!overview) throw new Error('AI 没有生成可用的调研结论。');
  return {
    overview,
    riskSignals: asTextArray(value.riskSignals),
    positiveSignals: asTextArray(value.positiveSignals),
    interviewClues: asTextArray(value.interviewClues),
    actions: asTextArray(value.actions),
    caveat: asText(value.caveat),
  };
}

export function formatResearchNote(summary: JobResearchSummary, preset: JobResearchPreset, createdAt = new Date()) {
  const label = jobResearchPresets.find((item) => item.value === preset)?.label ?? '在线调研';
  const section = (title: string, values: string[]) => values.length ? `${title}：\n${values.map((item) => `- ${item}`).join('\n')}` : '';
  return [
    `[${createdAt.toLocaleDateString('zh-CN')} ${label}]`,
    summary.overview,
    section('风险线索', summary.riskSignals),
    section('正面线索', summary.positiveSignals),
    section('面试线索', summary.interviewClues),
    section('下一步', summary.actions),
    summary.caveat ? `提醒：${summary.caveat}` : '',
  ].filter(Boolean).join('\n');
}

function domainLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./u, '');
    if (host.includes('xiaohongshu.com')) return '小红书';
    if (host.includes('nowcoder.com')) return '牛客';
    if (host.includes('zhihu.com')) return '知乎';
    if (host.includes('bilibili.com')) return 'B站';
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('v2ex.com')) return 'V2EX';
    return host;
  } catch {
    return '网页';
  }
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function readApiError(payload: unknown) {
  return readPath(payload, ['error', 'message']) || readPath(payload, ['readableMessage']) || readPath(payload, ['message']) || readPath(payload, ['raw']);
}

function readPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return asText(current);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(asText).filter(Boolean).slice(0, 8) : [];
}

function requireValue(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} 未填写。`);
}

function limitText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

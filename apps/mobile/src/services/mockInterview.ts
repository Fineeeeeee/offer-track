import { fetch } from 'expo/fetch';
import type {
  AiServiceSettings,
  Job,
  MockInterviewReport,
  MockInterviewTurn,
} from '../types';
import { resolveChatCompletionsUrl } from './apiEndpoint';
import { withRequestTimeout } from './requestTimeout';

export async function generateMockInterviewQuestion({
  job,
  round,
  turns,
  settings,
  apiKey,
}: {
  job: Job | null;
  round: string;
  turns: MockInterviewTurn[];
  settings: AiServiceSettings;
  apiKey: string;
}) {
  requireAiSettings(settings, apiKey);
  const history = turns
    .map((turn, index) => `第 ${index + 1} 题：${turn.question}\n回答：${turn.transcript}`)
    .join('\n\n');
  const content = await requestText(settings, apiKey, [
    {
      role: 'system',
      content: '你是一名克制、专业的中文面试官。每次只输出一道问题，不解释、不点评、不加序号。问题控制在 60 个汉字以内。',
    },
    {
      role: 'user',
      content: [
        `岗位：${job ? `${job.company} · ${job.title}` : '通用求职岗位'}`,
        `面试轮次：${round}`,
        job?.tags.length ? `岗位关键词：${job.tags.join('、')}` : '',
        history ? `此前问答：\n${history}` : '这是第一题，请从自我介绍或岗位动机开始。',
        history ? '根据最后一次回答提出自然追问，或转入下一个重要能力维度。' : '',
      ].filter(Boolean).join('\n'),
    },
  ]);
  const question = content.replace(/^\s*(?:问题|面试官)[：:]?\s*/u, '').trim();
  if (!question) throw new Error('模型没有返回可用的面试问题。');
  return question;
}

export async function reviewMockInterview({
  job,
  round,
  turns,
  settings,
  apiKey,
}: {
  job: Job | null;
  round: string;
  turns: MockInterviewTurn[];
  settings: AiServiceSettings;
  apiKey: string;
}): Promise<MockInterviewReport> {
  requireAiSettings(settings, apiKey);
  const evidence = turns.map((turn, index) => [
    `第 ${index + 1} 题：${turn.question}`,
    `回答：${turn.transcript}`,
    `起答延迟：${(turn.responseLatencyMillis / 1000).toFixed(1)} 秒`,
    `回答时长：${(turn.durationMillis / 1000).toFixed(1)} 秒`,
    `超过 1.2 秒的停顿：${turn.longPauseCount} 次`,
    `最长停顿：${(turn.longestPauseMillis / 1000).toFixed(1)} 秒`,
    `填充词：${turn.fillerCount} 次`,
    `语速：${turn.speechRate} 字/分钟`,
  ].join('\n')).join('\n\n');
  const content = await requestText(settings, apiKey, [
    {
      role: 'system',
      content: '你是严谨的面试训练复盘助手。只根据问题、回答和可观察的语音指标判断，不诊断人格或情绪，不把单次停顿直接判定为不会回答，不输出通过概率，只返回 JSON。',
    },
    {
      role: 'user',
      content: [
        `岗位：${job ? `${job.company} · ${job.title}` : '通用求职岗位'}`,
        `轮次：${round}`,
        '请返回：{"overall":"总体判断","strengths":["优点"],"risks":["有证据的风险"],"nextSteps":["下一步练习"]}',
        evidence,
      ].join('\n\n'),
    },
  ]);
  const parsed = parseJsonObject(content);
  return {
    overall: asText(parsed.overall) || '本次模拟已完成，可结合逐题记录继续复盘。',
    strengths: asTextList(parsed.strengths),
    risks: asTextList(parsed.risks),
    nextSteps: asTextList(parsed.nextSteps),
  };
}

async function requestText(
  settings: AiServiceSettings,
  apiKey: string,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
) {
  const response = await withRequestTimeout(90_000, (signal) => fetch(resolveChatCompletionsUrl(settings.reviewUrl), {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.reviewModel.trim(),
      temperature: 0.4,
      messages,
    }),
  }));
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`模拟面试接口返回了无法解析的内容（HTTP ${response.status}）。`);
  }
  if (!response.ok) {
    throw new Error(getString(payload, ['error', 'message']) || `模拟面试请求失败（HTTP ${response.status}）。`);
  }
  const content = getString(payload, ['choices', '0', 'message', 'content']);
  if (!content) throw new Error('模拟面试接口没有返回可读取的文本。');
  return content;
}

function requireAiSettings(settings: AiServiceSettings, apiKey: string) {
  if (!settings.reviewUrl.trim() || !settings.reviewModel.trim() || !apiKey.trim()) {
    throw new Error('请先在“我的 → AI 与转写”中配置复盘 URL、模型和 API Key。');
  }
}

function parseJsonObject(content: string): Record<string, unknown> {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const value = JSON.parse(normalized) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // The caller receives a product-facing error below.
  }
  throw new Error('模型返回的模拟面试复盘不是有效 JSON。');
}

function getString(payload: unknown, path: string[]) {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current.trim() : '';
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asTextList(value: unknown) {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

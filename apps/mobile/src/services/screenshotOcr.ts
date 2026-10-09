import { Buffer } from 'buffer';
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import type { AiServiceSettings, ApplicationStatus, Interview } from '../types';
import { parseScreenshotRecognition } from './screenshotOcrParser';
import { resolveChatCompletionsUrl } from './apiEndpoint';
import { withRequestTimeout } from './requestTimeout';

export type ScreenshotOcrFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type RecognizedJobRecord = {
  company: string;
  title: string;
  platform: string;
  city: string;
  salary: string;
  tags: string[];
  status: ApplicationStatus;
  recordDate: string;
  recordTime: string;
  recordGroup: string;
  contactMethod: string;
  recruiterName: string;
  recruiterTitle: string;
  recruitmentState: string;
  experience: string;
  education: string;
  companySize: string;
  industry: string;
  workMode: string;
  benefits: string[];
  jdSummary: string;
  sourceFile: string;
  confidence: Record<string, OcrConfidence>;
};

export type RecognizedInterviewRecord = {
  company: string;
  title: string;
  salary: string;
  city: string;
  round: string;
  type: string;
  startsAt: string;
  status: Interview['status'];
  contactName: string;
  contactTitle: string;
  address: string;
  notes: string;
  jdSummary: string;
  sourceFile: string;
  confidence: Record<string, OcrConfidence>;
};

export type OcrConfidence = 'high' | 'medium' | 'low';

export async function recognizeRecruitmentScreenshots({
  files,
  settings,
  apiKey,
  onProgress,
  signal,
}: {
  files: ScreenshotOcrFile[];
  settings: AiServiceSettings;
  apiKey: string;
  onProgress?: (progress: { completed: number; total: number }) => void;
  signal?: AbortSignal;
}) {
  requireValue(settings.ocrUrl, '截图识别 URL');
  requireValue(settings.ocrModel, '截图识别模型');
  requireValue(apiKey, 'API Key');

  const jobs: RecognizedJobRecord[] = [];
  const interviews: RecognizedInterviewRecord[] = [];
  let nextIndex = 0;
  let completed = 0;
  const worker = async () => {
    while (nextIndex < files.length) {
      if (signal?.aborted) throwAbortError();
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];
      const bytes = await new File(file.uri).arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const payload = await requestScreenshotRecognition(file, base64, settings, apiKey, signal);
      jobs.push(...payload.jobs.map((item) => normalizeJob(item, file.name)).filter(isCompleteJob));
      interviews.push(...payload.interviews.map((item) => normalizeInterview(item, file.name)).filter(isCompleteInterview));
      completed += 1;
      onProgress?.({ completed, total: files.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, files.length) }, () => worker()));

  return {
    jobs: mergeRecognizedJobs(jobs),
    interviews: mergeRecognizedInterviews(interviews),
  };
}

async function requestScreenshotRecognition(
  file: ScreenshotOcrFile,
  base64: string,
  settings: AiServiceSettings,
  apiKey: string,
  externalSignal?: AbortSignal,
) {
  const mimeType = file.mimeType?.startsWith('image/') ? file.mimeType : inferImageMimeType(file.name);
  const response = await withRequestTimeout(120_000, (signal) => fetch(resolveChatCompletionsUrl(settings.ocrUrl), {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.ocrModel.trim(),
      temperature: 0,
      max_tokens: 8192,
      stream: false,
      enable_thinking: false,
      messages: [
        {
          role: 'system',
          content:
            '你是招聘截图结构化识别器。只读取图片中明确出现的信息，不补全、不猜测。需要识别长职位详情页和求职记录列表中的每一张职位卡，只返回 JSON。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                '读取截图中全部职位和面试记录，不能只返回第一条。',
                '先判断页面类型：职位详情页通常只有一个职位但包含很长的职责、要求、福利和公司信息；求职记录列表包含按日期分组的多个职位卡。',
                '职位详情页必须从图片顶部读到最底部，jdSummary 按原顺序保留“职位职责 / 任职要求 / 福利待遇”完整可见文字，不要压缩成一句摘要。',
                '求职记录列表必须为每张可见卡片分别输出一条 job；顶部筛选条件、累计数量和日期标题不是职位。标题被省略号截断时只保留可见内容，并将 title confidence 标为 low。',
                '列表中的日期分组标题适用于它下方直到下一个日期标题前的所有卡片；将分组日期与卡片右侧时间合并到 recordDate/recordTime 或 interview.startsAt，不能只读取第一张卡片的时间。',
                '“停止招聘/岗位关闭”映射 status=ended；“交换过/沟通过”映射 responded；“简历/已投递”映射 applied；面试记录映射 interviewing。',
                '返回格式：',
                '{"jobs":[{"company":"","title":"","platform":"Boss直聘|智联招聘|猎聘|其他","city":"","salary":"","tags":[],"status":"interested|preparing|applied|responded|interviewing|offered|ended","recordDate":"","recordTime":"","recordGroup":"我看过|沟通过|交换过|面试|","contactMethod":"简历|微信|电话|","recruiterName":"","recruiterTitle":"","recruitmentState":"","experience":"","education":"","companySize":"","industry":"","workMode":"","benefits":[],"jdSummary":"","confidence":{"company":"high|medium|low","title":"high|medium|low","salary":"high|medium|low","city":"high|medium|low","recordDate":"high|medium|low","jdSummary":"high|medium|low"}}],"interviews":[{"company":"","title":"","salary":"","city":"","round":"","type":"电话|视频|现场|","startsAt":"","status":"待面试|待复盘|待反馈","contactName":"","contactTitle":"","address":"","notes":"","jdSummary":"","confidence":{"company":"high|medium|low","title":"high|medium|low","round":"high|medium|low","startsAt":"high|medium|low","address":"high|medium|low"}}]}',
                '求职记录中的“面试”卡片同时放入 jobs 和 interviews；没有明确面试时间时 startsAt 留空。',
                '面试详情页要提取联系人、面试地址、备注、面试形式和完整时间。页面写有“待评价”或记录位于“面试”历史列表时 status=待反馈；明确是未来安排时 status=待面试。绝对日期与“明天”等相对文字冲突时，以绝对日期为准。',
                '同一张图中每个职位只能输出一次。不要把地图地址、系统状态栏时间或底部按钮文字写入 JD。',
              ].join('\n'),
            },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  }), externalSignal);

  const raw = await response.text();
  const body = parseJson(raw);
  if (!response.ok) {
    throw new Error(formatRequestError(response.status, readError(body) || raw));
  }

  if (isRecognitionPayload(body)) {
    return {
      jobs: Array.isArray(body.jobs) ? body.jobs : [],
      interviews: Array.isArray(body.interviews) ? body.interviews : [],
    };
  }

  const content = readAssistantContent(body);
  if (!content) {
    throw new Error('识别接口没有返回可读取的文本。');
  }
  return parseScreenshotRecognition(content);
}

function throwAbortError(): never {
  const error = new Error('截图识别已取消。');
  error.name = 'AbortError';
  throw error;
}

function normalizeJob(value: unknown, sourceFile: string): RecognizedJobRecord {
  const item = asRecord(value);
  return {
    company: text(item.company),
    title: text(item.title),
    platform: text(item.platform) || '截图导入',
    city: text(item.city),
    salary: text(item.salary),
    tags: Array.isArray(item.tags) ? item.tags.map(text).filter(Boolean) : [],
    status: normalizeJobStatus(text(item.status) || text(item.recruitmentState)),
    recordDate: text(item.recordDate),
    recordTime: text(item.recordTime),
    recordGroup: text(item.recordGroup),
    contactMethod: text(item.contactMethod),
    recruiterName: text(item.recruiterName),
    recruiterTitle: text(item.recruiterTitle),
    recruitmentState: text(item.recruitmentState),
    experience: text(item.experience),
    education: text(item.education),
    companySize: text(item.companySize),
    industry: text(item.industry),
    workMode: text(item.workMode),
    benefits: Array.isArray(item.benefits) ? item.benefits.map(text).filter(Boolean) : [],
    jdSummary: text(item.jdSummary),
    sourceFile,
    confidence: normalizeConfidence(item.confidence, ['company', 'title', 'salary', 'city', 'recordDate', 'jdSummary']),
  };
}

function normalizeInterview(value: unknown, sourceFile: string): RecognizedInterviewRecord {
  const item = asRecord(value);
  return {
    company: text(item.company),
    title: text(item.title),
    salary: text(item.salary),
    city: text(item.city),
    round: text(item.round) || '面试',
    type: text(item.type),
    startsAt: text(item.startsAt),
    status: normalizeInterviewStatus(text(item.status)),
    contactName: text(item.contactName) || text(item.recruiterName),
    contactTitle: text(item.contactTitle) || text(item.recruiterTitle),
    address: text(item.address),
    notes: text(item.notes) || text(item.note),
    jdSummary: text(item.jdSummary),
    sourceFile,
    confidence: normalizeConfidence(item.confidence, ['company', 'title', 'round', 'startsAt', 'address']),
  };
}

function isCompleteJob(item: RecognizedJobRecord) {
  return Boolean(item.company && item.title);
}

function isCompleteInterview(item: RecognizedInterviewRecord) {
  return Boolean(item.company && item.title);
}

function normalizeJobStatus(value: string): ApplicationStatus {
  const allowed: ApplicationStatus[] = ['interested', 'preparing', 'applied', 'responded', 'interviewing', 'offered', 'ended'];
  if (allowed.includes(value as ApplicationStatus)) return value as ApplicationStatus;
  if (/面试/.test(value)) return 'interviewing';
  if (/沟通|交换|回复/.test(value)) return 'responded';
  if (/投递|简历/.test(value)) return 'applied';
  if (/停止|关闭|结束/.test(value)) return 'ended';
  return 'interested';
}

function normalizeInterviewStatus(value: string): Interview['status'] {
  if (value === '待复盘') return value;
  if (value === '待反馈' || /待评价|已面试|历史/.test(value)) return '待反馈';
  return '待面试';
}

export function mergeRecognizedJobs(items: RecognizedJobRecord[]) {
  const merged = new Map<string, RecognizedJobRecord>();
  items.forEach((item) => {
    const key = `${normalizeText(item.company)}:${normalizeText(item.title)}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      return;
    }
    merged.set(key, {
      ...current,
      platform: preferText(current.platform, item.platform),
      city: preferText(current.city, item.city),
      salary: preferText(current.salary, item.salary),
      status: preferStatus(current.status, item.status),
      recordDate: preferText(current.recordDate, item.recordDate),
      recordTime: preferText(current.recordTime, item.recordTime),
      recordGroup: preferText(current.recordGroup, item.recordGroup),
      contactMethod: preferText(current.contactMethod, item.contactMethod),
      recruiterName: preferText(current.recruiterName, item.recruiterName),
      recruiterTitle: preferText(current.recruiterTitle, item.recruiterTitle),
      recruitmentState: preferText(current.recruitmentState, item.recruitmentState),
      experience: preferText(current.experience, item.experience),
      education: preferText(current.education, item.education),
      companySize: preferText(current.companySize, item.companySize),
      industry: preferText(current.industry, item.industry),
      workMode: preferText(current.workMode, item.workMode),
      benefits: Array.from(new Set([...current.benefits, ...item.benefits])),
      tags: Array.from(new Set([...current.tags, ...item.tags])),
      jdSummary: current.jdSummary.length >= item.jdSummary.length ? current.jdSummary : item.jdSummary,
      confidence: mergeConfidence(current.confidence, item.confidence),
    });
  });
  return Array.from(merged.values());
}

export function isLikelySamePosition(
  left: Pick<RecognizedJobRecord, 'company' | 'title'>,
  right: Pick<RecognizedJobRecord, 'company' | 'title'>,
) {
  if (normalizeText(left.company) !== normalizeText(right.company)) return false;
  const leftTitle = normalizePositionTitle(left.title);
  const rightTitle = normalizePositionTitle(right.title);
  if (!leftTitle || !rightTitle) return false;
  return leftTitle === rightTitle || (
    Math.min(leftTitle.length, rightTitle.length) >= 4 &&
    (leftTitle.startsWith(rightTitle) || rightTitle.startsWith(leftTitle))
  ) || bigramDice(leftTitle, rightTitle) >= 0.45;
}

export function mergeRecognizedInterviews(items: RecognizedInterviewRecord[]) {
  const merged: RecognizedInterviewRecord[] = [];
  items.forEach((item) => {
    const index = merged.findIndex((current) =>
      isLikelySamePosition(current, item) &&
      (!current.startsAt || !item.startsAt || normalizeText(current.startsAt) === normalizeText(item.startsAt)),
    );
    if (index < 0) {
      merged.push(item);
      return;
    }
    const current = merged[index];
    merged[index] = {
      ...current,
      title: preferText(current.title, item.title),
      salary: preferText(current.salary, item.salary),
      city: preferText(current.city, item.city),
      round: preferText(current.round, item.round),
      type: preferText(current.type, item.type),
      startsAt: preferText(current.startsAt, item.startsAt),
      status: current.status === '待反馈' || item.status === '待反馈' ? '待反馈' : item.status,
      contactName: preferText(current.contactName, item.contactName),
      contactTitle: preferText(current.contactTitle, item.contactTitle),
      address: preferText(current.address, item.address),
      notes: preferText(current.notes, item.notes),
      jdSummary: preferText(current.jdSummary, item.jdSummary),
      confidence: mergeConfidence(current.confidence, item.confidence),
    };
  });
  return merged;
}

function normalizePositionTitle(value: string) {
  return normalizeText(value).replace(/[.。…·•()（）/\\\-]/g, '');
}

function bigramDice(left: string, right: string) {
  if (left.length < 2 || right.length < 2) return 0;
  const leftPairs = Array.from({ length: left.length - 1 }, (_, index) => left.slice(index, index + 2));
  const available = Array.from({ length: right.length - 1 }, (_, index) => right.slice(index, index + 2));
  let overlap = 0;
  leftPairs.forEach((pair) => {
    const index = available.indexOf(pair);
    if (index < 0) return;
    overlap += 1;
    available.splice(index, 1);
  });
  return (2 * overlap) / (leftPairs.length + right.length - 1);
}

function preferText(current: string, incoming: string) {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.length > current.length ? incoming : current;
}

function preferStatus(current: ApplicationStatus, incoming: ApplicationStatus) {
  const priority: ApplicationStatus[] = ['interested', 'preparing', 'applied', 'responded', 'interviewing', 'offered', 'ended'];
  return priority.indexOf(incoming) > priority.indexOf(current) ? incoming : current;
}

function mergeConfidence(current: Record<string, OcrConfidence>, incoming: Record<string, OcrConfidence>) {
  const score: Record<OcrConfidence, number> = { low: 0, medium: 1, high: 2 };
  return Object.fromEntries(Array.from(new Set([...Object.keys(current), ...Object.keys(incoming)])).map((field) => {
    const left = current[field] ?? 'medium';
    const right = incoming[field] ?? 'medium';
    return [field, score[right] > score[left] ? right : left];
  }));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecognitionPayload(value: unknown): value is { jobs?: unknown; interviews?: unknown } {
  return Boolean(value && typeof value === 'object' && ('jobs' in value || 'interviews' in value));
}

function readAssistantContent(value: unknown) {
  const content = readUnknownPath(value, ['choices', '0', 'message', 'content']);
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const item = part as Record<string, unknown>;
          return typeof item.text === 'string' ? item.text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return readPath(value, ['output_text']) || readPath(value, ['text']);
}

function readError(value: unknown) {
  return readPath(value, ['error', 'message']) || readPath(value, ['message']) || readPath(value, ['raw']);
}

function readPath(value: unknown, path: string[]) {
  const current = readUnknownPath(value, path);
  return typeof current === 'string' ? current.trim() : '';
}

function readUnknownPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function formatRequestError(status: number, detail: string) {
  const concise = detail.trim().slice(0, 500);
  if (status === 401 || status === 403) return `截图识别鉴权失败（${status}）。请检查 API Key 是否属于当前服务。`;
  if (status === 413) return '截图文件超过接口限制。请裁剪长截图或分成多张后重试。';
  if (/vision|image|multimodal|图片|图像|模态|unsupported.*content/i.test(concise)) {
    return `当前 OCR 模型可能不支持图片输入。请换成视觉模型。\n\n${concise}`;
  }
  return concise ? `截图识别请求失败（${status}）\n\n${concise}` : `截图识别请求失败（${status}）`;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeConfidence(value: unknown, fields: string[]) {
  const source = asRecord(value);
  return Object.fromEntries(fields.map((field) => {
    const confidence = text(source[field]).toLowerCase();
    return [field, confidence === 'high' || confidence === 'low' ? confidence : 'medium'];
  })) as Record<string, OcrConfidence>;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function requireValue(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} 未填写。`);
}

function inferImageMimeType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

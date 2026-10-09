import { fetch } from 'expo/fetch';
import type { AiServiceSettings, Interview, InterviewDraft, InterviewQuestionReview, Job, PreparationMaterial, TencentAsrCredentials, UserInterviewProfile } from '../types';
import { transcribeLocalAudio } from './localWhisper';
import { transcribeWithSenseVoice } from './senseVoice';
import { transcribeWithTencentFlash } from './tencentAsr';
import { resolveChatCompletionsUrl } from './apiEndpoint';

export type AiInterviewReview = {
  overall: string;
  strengths: string;
  risks: string;
  improvedAnswer: string;
  questions: string[];
  scores: Record<string, number>;
  questionReviews: InterviewQuestionReview[];
  actionItems: string[];
  progressComparedWithPast: string;
  recurringPatterns: string[];
  profileSummary: string;
  profileStrengths: string[];
  profileRisks: string[];
  nextFocus: string[];
};

export type InterviewReviewHistory = {
  company: string;
  title: string;
  round: string;
  reviewedAt: string;
  overall: string;
  strengths: string;
  risks: string;
  scores: Record<string, number>;
};

export type InterviewReviewDraft = Pick<InterviewDraft,
  'transcript' | 'transcriptionState' | 'transcriptionCompletedParts' | 'transcriptionTotalParts'
  | 'interviewMode' | 'selfSpeakerLabel' | 'preparationMaterials' | 'selfIntroduction' | 'projectStories'>;

export function getReviewInputIssue(draft: Pick<InterviewDraft, 'transcript' | 'transcriptionState' | 'transcriptionCompletedParts' | 'transcriptionTotalParts'>) {
  if (!draft.transcript.trim()) return '请先完成录音转写，再生成复盘。';
  if (draft.transcriptionState === 'processing' || draft.transcriptionState === 'failed'
    || (draft.transcriptionTotalParts > 0 && draft.transcriptionCompletedParts < draft.transcriptionTotalParts)) {
    return '转写尚未完成，请先在录音页继续转写，避免遗漏后半场内容。';
  }
  return '';
}

export function canReviewPersonalPerformance(draft: Pick<InterviewDraft, 'interviewMode' | 'selfSpeakerLabel'>) {
  return draft.interviewMode !== 'group' || Boolean(draft.selfSpeakerLabel.trim());
}

export async function transcribeInterviewAudio({
  audioUri,
  audioName,
  settings,
  tencentCredentials,
  onProgress,
  onPartialTranscript,
  resume,
}: {
  audioUri: string;
  audioName: string;
  settings: AiServiceSettings;
  apiKey: string;
  tencentCredentials?: TencentAsrCredentials;
  onProgress?: (progress: { completed: number; total: number }) => void;
  onPartialTranscript?: (text: string, completed: number, total: number) => void;
  resume?: { completedParts: number; totalParts: number; transcript: string };
}) {
  if (settings.transcriptionProvider === 'tencent-flash') {
    if (!tencentCredentials) {
      throw new Error('腾讯云转写凭据未配置。');
    }
    const transcript = await transcribeWithTencentFlash({
      audioUri,
      audioName,
      engineType: settings.tencentEngineType,
      credentials: tencentCredentials,
      onProgress,
      onPartialTranscript,
      resume,
    });
    return transcript;
  }
  if (settings.transcriptionProvider === 'local-sensevoice') {
    return transcribeWithSenseVoice({ audioUri, onProgress, onPartialTranscript, resume });
  }
  return transcribeLocalAudio(audioUri, onProgress, onPartialTranscript, resume);
}

export async function reviewInterviewTranscript({
  transcript,
  interview,
  linkedJob,
  draft,
  settings,
  apiKey,
  signal,
  profile,
  history,
}: {
  transcript: string;
  interview: Interview;
  linkedJob: Job | null;
  draft: InterviewReviewDraft;
  settings: AiServiceSettings;
  apiKey: string;
  signal?: AbortSignal;
  profile: UserInterviewProfile;
  history: InterviewReviewHistory[];
}) {
  requireSetting(settings.reviewUrl, 'AI 复盘 URL');
  requireSetting(settings.reviewModel, 'AI 复盘模型');
  requireSetting(apiKey, 'API Key');
  requireSetting(transcript, '转写文本');
  const issue = getReviewInputIssue({ ...draft, transcript });
  if (issue) throw new Error(issue);

  const review = await requestFinalReview({
    prompt: buildReviewPrompt(transcript, interview, linkedJob, draft, profile, history),
    settings,
    apiKey,
    signal,
  });
  if (!canReviewPersonalPerformance(draft)) {
    return { ...review, scores: {}, progressComparedWithPast: '', recurringPatterns: [],
      profileSummary: '', profileStrengths: [], profileRisks: [], nextFocus: [] };
  }
  return review;
}

export async function generateInterviewPreparation({
  interview,
  linkedJob,
  jdSummary,
  settings,
  apiKey,
  signal,
}: {
  interview: Interview;
  linkedJob: Job | null;
  jdSummary: string;
  settings: AiServiceSettings;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Array<Omit<PreparationMaterial, 'id'>>> {
  requireSetting(settings.reviewUrl, 'AI 复盘 URL');
  requireSetting(settings.reviewModel, 'AI 复盘模型');
  requireSetting(apiKey, 'API Key');
  const content = await requestChatContent({
    prompt: [
      '请为这场面试生成 3 到 5 项可以直接执行的准备材料，只返回 JSON 数组。',
      '每项字段固定为：{"kind":"role|project|technical|questions|company|intro","title":"简短标题","body":"具体准备内容","importance":"high|normal"}。',
      '不要写泛泛建议。优先把 JD 职责转成项目证据、技术追问和可验证的反问；信息不足时提供通用但能直接填写的模板。',
      `公司：${interview.company}`,
      `岗位：${linkedJob?.title || interview.title}`,
      `轮次：${interview.round}`,
      `岗位标签：${linkedJob?.tags.join('、') || '未提供'}`,
      `JD 与职责：${limitPromptText(jdSummary, 5000) || '未提供'}`,
    ].join('\n\n'),
    settings,
    apiKey,
    signal,
    maxTokens: 1800,
    systemPrompt: '你是求职面试准备助手。内容必须基于提供的岗位信息，不编造公司事实，只返回 JSON。',
  });
  return parsePreparationMaterials(content);
}

async function requestFinalReview({ prompt, settings, apiKey, signal }: { prompt: string; settings: AiServiceSettings; apiKey: string; signal?: AbortSignal }) {
  const content = await requestChatContent({
    prompt,
    settings,
    apiKey,
    signal,
    maxTokens: 3200,
    systemPrompt: '你是严谨的求职面试复盘助手。只根据提供的信息判断，不编造事实，不给绝对通过概率。只返回 JSON。',
  });
  return parseReview(content);
}

async function requestChatContent({
  prompt,
  settings,
  apiKey,
  maxTokens,
  systemPrompt,
  signal,
}: {
  prompt: string;
  settings: AiServiceSettings;
  apiKey: string;
  maxTokens: number;
  systemPrompt: string;
  signal?: AbortSignal;
}) {
  assertReviewNotAborted(signal);
  const response = await fetch(resolveChatCompletionsUrl(settings.reviewUrl), {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.reviewModel.trim(),
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });
  const payload = await readJson(response);
  assertReviewNotAborted(signal);
  if (!response.ok) {
    throw new Error(getApiError(payload, `AI 请求失败（${response.status}）`));
  }

  const finishReason = getString(payload, ['choices', '0', 'finish_reason']);
  if (finishReason === 'length') {
    throw new Error('模型输出达到长度上限，复盘未完整返回。这不是等待超时；旧复盘仍保留，未自动重试。');
  }
  if (finishReason === 'content_filter') {
    throw new Error('模型服务拦截了本次输出，未生成复盘。旧复盘仍保留。');
  }

  const content =
    getString(payload, ['choices', '0', 'message', 'content']) ||
    getString(payload, ['output_text']) ||
    getString(payload, ['text']);
  if (!content) {
    throw new Error('AI 接口返回成功，但没有可读取的文本。');
  }
  return content;
}

function assertReviewNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error('复盘已取消。');
  error.name = 'AbortError';
  throw error;
}

export function buildReviewPrompt(
  transcript: string,
  interview: Interview,
  linkedJob: Job | null,
  draft: InterviewReviewDraft,
  profile: UserInterviewProfile,
  history: InterviewReviewHistory[],
) {
  const historyText = history.slice(0, 5).map((item, index) => [
    `历史 ${index + 1}：${item.company} · ${item.title} · ${item.round} · ${item.reviewedAt}`,
    `总体：${limitPromptText(item.overall, 500)}`,
    `优势：${limitPromptText(item.strengths, 400)}`,
    `风险：${limitPromptText(item.risks, 400)}`,
    `评分：${JSON.stringify(item.scores)}`,
  ].join('\n')).join('\n\n');
  return [
    '请复盘下面这场面试，并返回 JSON 对象，字段必须是：',
    '{"overall":"总体判断","strengths":"做得好的地方","risks":"风险和不足","improvedAnswer":"下一次可复用的改进回答","questions":["面试问题1"],"scores":{"表达清晰度":4,"结构完整度":3,"岗位相关度":4,"证据充分度":3},"questionReviews":[{"question":"问题","answerSummary":"回答摘要","score":3,"feedback":"具体改进点","evidenceTime":"03:42"}],"actionItems":["下一步动作"],"progressComparedWithPast":"有历史时说明进步或退步，无历史时留空","recurringPatterns":["跨场次重复模式"],"profileSummary":"更新后的长期画像摘要","profileStrengths":["有证据的稳定优势"],"profileRisks":["重复出现的风险"],"nextFocus":["下一场训练重点"]}',
    '评分必须为 1 到 5 的整数；evidenceTime 只能引用转写中存在的时间戳，无法定位时留空。',
    '转写是保留证据的原始稿，可能没有标点，也可能混有系统播报、识别错词、重复、自我修正和“嗯、呃、然后”等口语填充词。请先在理解层面自行断句，不要因为缺少标点直接降低评分。',
    '请区分面试官/系统播报与候选人回答。重点判断候选人的犹豫、重复、口头禅是否影响表达；在 risks 中说明具体模式，在 actionItems 中给出可执行的改进方法，并尽量引用对应时间戳。不要虚构说话人或不存在的内容。',
    'improvedAnswer 应选择最值得改进的一段候选人回答，在不改变事实的前提下去除无意义重复和填充词，整理成可复用的结构化回答。原始转写不会被覆盖。',
    '准备材料和 JD 只作为背景，不代表候选人当场讲过或已经做到。评价必须引用原始转写中的实际表现。只有文字证据时，不能推断停顿时长、音色或语速；口语填充词本身不是缺点，需说明它如何影响理解。',
    '在输出预算内优先写完整 JSON：总体结论、优势、风险和行动建议必须具体；逐题选择最值得复盘的关键问题，不重复抄写大段转写，不声称逐题覆盖了未列出的问题。',
    '纵向比较只能依据提供的历史复盘。没有历史时 progressComparedWithPast 必须留空，recurringPatterns 只能返回本场内部重复模式，不得伪造趋势。长期画像中的每项结论必须能由本场或历史复盘支撑。',
    draft.interviewMode === 'group'
      ? draft.selfSpeakerLabel.trim()
        ? `这是群面。转写中用户已确认自己的说话人标签是“${draft.selfSpeakerLabel.trim()}”。只分析该标签对应的用户表现，同时比较其与其他候选人的内容差异。`
        : '这是群面，但用户尚未确认自己的说话人标签。不得根据长期文字画像擅自认定哪位说话人是用户；只做不归因到个人的讨论结构分析，并在 risks 中提示需要确认身份。scores 返回空对象；progressComparedWithPast、profileSummary 返回空字符串，recurringPatterns、profileStrengths、profileRisks、nextFocus 返回空数组。'
      : '这是一对一或普通面试。按候选人与面试官的角色进行分析。',
    `公司：${interview.company}`,
    `岗位：${linkedJob?.title ?? interview.title}`,
    `轮次：${interview.round}`,
    `JD 摘要：${interview.jdSummary}`,
    `自我介绍准备：${draft.selfIntroduction}`,
    `项目案例准备：${draft.projectStories}`,
    `其他准备材料：\n${draft.preparationMaterials.map((item) => `【${item.title}】\n${item.body}`).join('\n\n')}`,
    `当前长期画像：\n${JSON.stringify({
      summary: limitPromptText(profile.summary, 800),
      strengths: profile.stableStrengths.slice(0, 8).map((item) => limitPromptText(item, 240)),
      risks: profile.recurringRisks.slice(0, 8).map((item) => limitPromptText(item, 240)),
      focus: profile.currentFocus.slice(0, 6).map((item) => limitPromptText(item, 240)),
    })}`,
    `最近历史复盘：\n${historyText || '暂无历史复盘'}`,
    `完整面试转写：\n${transcript}`,
  ].join('\n\n');
}

function limitPromptText(value: string, maxLength: number) {
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function parseReview(content: string): AiInterviewReview {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let payload: unknown;
  try {
    payload = JSON.parse(normalized);
  } catch {
    throw new Error('AI 返回的复盘不是有效 JSON，请检查模型是否遵循 JSON 输出要求。');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('AI 返回的复盘结构无效。');
  }
  const value = payload as Record<string, unknown>;
  if (!asText(value.overall) || (!asText(value.strengths) && !asText(value.risks))) {
    throw new Error('模型未返回有效的总体判断和表现分析，未覆盖原有复盘。');
  }
  return {
    overall: asText(value.overall),
    strengths: asText(value.strengths),
    risks: asText(value.risks),
    improvedAnswer: asText(value.improvedAnswer),
    questions: Array.isArray(value.questions) ? value.questions.map(asText).filter(Boolean) : [],
    scores: parseScores(value.scores),
    questionReviews: parseQuestionReviews(value.questionReviews),
    actionItems: Array.isArray(value.actionItems) ? value.actionItems.map(asText).filter(Boolean) : [],
    progressComparedWithPast: asText(value.progressComparedWithPast),
    recurringPatterns: parseTextArray(value.recurringPatterns),
    profileSummary: asText(value.profileSummary),
    profileStrengths: parseTextArray(value.profileStrengths),
    profileRisks: parseTextArray(value.profileRisks),
    nextFocus: parseTextArray(value.nextFocus),
  };
}

export function parsePreparationMaterials(content: string): Array<Omit<PreparationMaterial, 'id'>> {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let payload: unknown;
  try {
    payload = JSON.parse(normalized);
  } catch {
    throw new Error('AI 返回的准备事项不是有效 JSON。');
  }
  if (!Array.isArray(payload)) throw new Error('AI 返回的准备事项结构无效。');
  const allowedKinds = new Set<PreparationMaterial['kind']>(['intro', 'project', 'company', 'role', 'technical', 'questions']);
  const materials = payload.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    const title = asText(value.title);
    const body = asText(value.body);
    const kind = asText(value.kind) as PreparationMaterial['kind'];
    if (!title || !body || !allowedKinds.has(kind)) return [];
    return [{
      kind,
      title: title.slice(0, 40),
      body,
      importance: value.importance === 'high' ? 'high' as const : 'normal' as const,
    }];
  }).slice(0, 5);
  if (!materials.length) throw new Error('AI 没有返回可用的准备事项。');
  return materials;
}

function parseTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

function parseScores(value: unknown) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, score]) => {
    const number = Number(score);
    return key.trim() && Number.isFinite(number) ? [[key.trim(), Math.max(1, Math.min(5, Math.round(number)))]] : [];
  }));
}

function parseQuestionReviews(value: unknown): InterviewQuestionReview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const question = asText(record.question);
    if (!question) return [];
    return [{
      question,
      answerSummary: asText(record.answerSummary),
      score: Math.max(1, Math.min(5, Math.round(Number(record.score) || 1))),
      feedback: asText(record.feedback),
      evidenceTime: asText(record.evidenceTime),
    }];
  });
}

async function readJson(response: Response) {
  const text = await response.text();
  return parseJsonText(text);
}

function parseJsonText(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function getApiError(payload: unknown, fallback: string) {
  return (
    getString(payload, ['error', 'message']) ||
    getString(payload, ['message']) ||
    getString(payload, ['raw']) ||
    fallback
  );
}

function getString(payload: unknown, path: string[]) {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current.trim() : '';
}

function requireSetting(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} 未填写。`);
  }
}

function requireHttpUrl(value: string, label: string) {
  const normalized = value.trim();
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error(`${label} 无效。请填写包含 https:// 的完整接口地址。`);
  }
}

function getUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
const fetch = vi.hoisted(() => vi.fn<typeof globalThis.fetch>());
vi.mock('expo/fetch', () => ({ fetch }));
vi.mock('./localWhisper', () => ({ transcribeLocalAudio: vi.fn() }));
vi.mock('./senseVoice', () => ({ transcribeWithSenseVoice: vi.fn() }));
vi.mock('./tencentAsr', () => ({ transcribeWithTencentFlash: vi.fn() }));
import { buildReviewPrompt, canReviewPersonalPerformance, getReviewInputIssue, parsePreparationMaterials, parseReview, reviewInterviewTranscript, type InterviewReviewDraft } from './aiService';
import { emptyInterviewProfile } from '../domain/interviewProfile';
import type { AiServiceSettings, Interview } from '../types';

const interview = { company: '测试公司', title: '工程师', round: '一面', type: '现场', startsAt: '', status: '待复盘', audioState: '已转写', jdSummary: '', checklist: [], id: 1, jobId: 1 } as Interview;
const draft: InterviewReviewDraft = {
  transcript: '[00:12] 我：嗯，我先说明背景。\n[89:30] 面试官：最后一个问题。',
  transcriptionState: 'completed', transcriptionCompletedParts: 9, transcriptionTotalParts: 9,
  interviewMode: 'individual', selfSpeakerLabel: '', preparationMaterials: [], selfIntroduction: '', projectStories: '',
};
const settings = { reviewUrl: 'https://example.com/v1', reviewModel: 'test-model' } as AiServiceSettings;
const review = { overall: '回答结构清楚', strengths: '用实例解释方案', risks: '缺少结果指标', actionItems: ['补充指标'] };
const options = { transcript: draft.transcript, draft, interview, linkedJob: null, settings, apiKey: 'test-only', profile: emptyInterviewProfile, history: [] };

function respond(content: string, finishReason = 'stop', status = 200) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }), { status }));
}

describe('AI interview review', () => {
  beforeEach(() => vi.mocked(fetch).mockReset());
  it('parses longitudinal profile fields without requiring them from older models', () => {
    const parsed = parseReview(JSON.stringify({ overall: '稳定', strengths: '结构清楚', progressComparedWithPast: '结构更清楚', recurringPatterns: ['证据不足'], nextFocus: ['补充指标'] }));
    expect(parsed.progressComparedWithPast).toBe('结构更清楚');
    expect(parsed.recurringPatterns).toEqual(['证据不足']);
    expect(parsed.profileStrengths).toEqual([]);
  });

  it('does not let a text profile silently identify the user in a group interview', () => {
    const prompt = buildReviewPrompt('说话人 A：方案一', { company: '测试公司', title: '工程师', round: '群面', type: '现场', startsAt: '', status: '待复盘', audioState: '已转写', jdSummary: '', checklist: [], id: 1, jobId: 1 }, null, {
      interviewMode: 'group', selfSpeakerLabel: '', preparationMaterials: [], selfIntroduction: '', projectStories: '',
    } as never, emptyInterviewProfile, []);
    expect(prompt).toContain('不得根据长期文字画像擅自认定');
  });

  it('keeps the unedited timestamped transcript as review evidence', () => {
    const rawTranscript = '【00:00-00:30】\n[00:12] 我：嗯，我当时其实停顿了很久。';
    const prompt = buildReviewPrompt(rawTranscript, { company: '测试公司', title: '工程师', round: '一面', type: '现场', startsAt: '', status: '待复盘', audioState: '已转写', jdSummary: '', checklist: [], id: 1, jobId: 1 }, null, {
      interviewMode: 'single', selfSpeakerLabel: '', preparationMaterials: [], selfIntroduction: '', projectStories: '',
    } as never, emptyInterviewProfile, []);
    expect(prompt).toContain(rawTranscript);
  });

  it.each(['{}', '[]', 'null', '{"overall":""}', '{"overall":"已完成"}'])('rejects empty or incomplete review %s', (content) => {
    expect(() => parseReview(content)).toThrow();
  });

  it('accepts a complete fenced JSON response', () => {
    expect(parseReview(`\`\`\`json\n${JSON.stringify(review)}\n\`\`\``)).toMatchObject(review);
  });

  it.each(['processing', 'failed'] as const)('blocks %s transcription before any paid request', async (state) => {
    await expect(reviewInterviewTranscript({ ...options, draft: { ...draft, transcriptionState: state } })).rejects.toThrow('转写尚未完成');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks incomplete part counts even if the saved state says completed', () => {
    expect(getReviewInputIssue({ ...draft, transcriptionCompletedParts: 3 })).toContain('转写尚未完成');
  });

  it('accepts manually supplied transcript without audio progress', () => {
    expect(getReviewInputIssue({ ...draft, transcriptionState: 'idle', transcriptionCompletedParts: 0, transcriptionTotalParts: 0 })).toBe('');
  });

  it('does not review an empty transcript', () => {
    expect(getReviewInputIssue({ ...draft, transcript: '  ' })).toContain('先完成');
  });

  it('sends the whole original transcript once, without a timer or organized-text replacement', async () => {
    respond(JSON.stringify(review));
    const controller = new AbortController();
    const source = { ...draft, transcriptQaPairs: [{ answer: '整理后的替换文案' }] };
    const before = JSON.stringify(source);
    const result = await reviewInterviewTranscript({ ...options, draft: source, signal: controller.signal });
    expect(result).toMatchObject(review);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://example.com/v1/chat/completions');
    expect(request?.signal).toBe(controller.signal);
    const body = JSON.parse(String(request?.body));
    expect(body.messages[1].content).toContain(draft.transcript);
    expect(body.messages[1].content).not.toContain('整理后的替换文案');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('reports output truncation without silently issuing another request', async () => {
    respond('{"overall":"内容尚未写完', 'length');
    await expect(reviewInterviewTranscript(options)).rejects.toThrow('这不是等待超时');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry malformed JSON automatically', async () => {
    respond('模型未输出JSON');
    await expect(reviewInterviewTranscript(options)).rejects.toThrow('不是有效 JSON');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a successful response with no visible content as a failure', async () => {
    respond('');
    await expect(reviewInterviewTranscript(options)).rejects.toThrow('没有可读取的文本');
  });

  it('rejects an already cancelled task before sending', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(reviewInterviewTranscript({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('discards a late response after cancellation even if the provider ignores abort', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(async () => {
      controller.abort();
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(review) } }] }));
    });
    await expect(reviewInterviewTranscript({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not accept personal trends or scores for an unidentified group participant', async () => {
    respond(JSON.stringify({ ...review, scores: { 表达: 5 }, profileSummary: '擅长主持', profileStrengths: ['领导力'], progressComparedWithPast: '显著进步' }));
    const groupDraft = { ...draft, interviewMode: 'group' as const };
    expect(canReviewPersonalPerformance(groupDraft)).toBe(false);
    const result = await reviewInterviewTranscript({ ...options, draft: groupDraft });
    expect(result).toMatchObject({ scores: {}, profileSummary: '', profileStrengths: [], progressComparedWithPast: '' });
    expect(canReviewPersonalPerformance({ ...groupDraft, selfSpeakerLabel: '候选人 A' })).toBe(true);
  });
});

describe('AI interview preparation', () => {
  it('accepts useful materials and normalizes importance', () => {
    expect(parsePreparationMaterials(JSON.stringify([
      { kind: 'project', title: '准备项目证据', body: '按背景、动作和结果准备一个案例', importance: 'high' },
      { kind: 'questions', title: '反问', body: '确认入职三个月目标', importance: 'unexpected' },
    ]))).toEqual([
      { kind: 'project', title: '准备项目证据', body: '按背景、动作和结果准备一个案例', importance: 'high' },
      { kind: 'questions', title: '反问', body: '确认入职三个月目标', importance: 'normal' },
    ]);
  });

  it('rejects empty or unsupported preparation output', () => {
    expect(() => parsePreparationMaterials('[{"kind":"unknown","title":"标题","body":"内容"}]')).toThrow();
    expect(() => parsePreparationMaterials('not-json')).toThrow();
  });
});

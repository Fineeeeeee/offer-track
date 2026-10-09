import { describe, expect, it, vi } from 'vitest';

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
import { fetch } from 'expo/fetch';
import { buildTranscriptOrganizationChunks, organizeInterviewTranscript, parseTranscriptQaResponse } from './transcriptOrganization';

describe('transcript organization', () => {
  it('keeps transcript segments addressable', () => {
    const chunks = buildTranscriptOrganizationChunks('[00:10] 介绍一下项目\n[00:20] 我负责 RAG 检索', 60);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].map((item) => item.index)).toEqual([0, 1]);
  });

  it('splits a transcript without punctuation into bounded chunks', () => {
    const chunks = buildTranscriptOrganizationChunks('很长的连续转写'.repeat(2200), 5400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat().every((item) => item.text.length <= 700)).toBe(true);
    expect(chunks.every((items) => items.reduce((sum, item) => sum + item.text.length + 20, 0) <= 3200)).toBe(true);
  });

  it('creates short time-addressable pieces for weak-model group organization', () => {
    const chunks = buildTranscriptOrganizationChunks('没有标点的多人面试转写'.repeat(180), 600, 1_000, 220);
    const pieces = chunks.flat();
    expect(pieces.length).toBeGreaterThan(5);
    expect(pieces.every((item) => item.text.length <= 220)).toBe(true);
    expect(pieces.slice(1).every((item, index) => item.startSeconds > pieces[index].startSeconds)).toBe(true);
  });

  it('keeps evidence block references in organized topics and turns', () => {
    const chunks = buildTranscriptOrganizationChunks(
      '面试官：请开始。\n候选人：我开始回答。',
      30,
      1_000,
      220,
      [
        { id: 'b0', parentId: 'transcript-root', parentSegmentIndex: 0, speaker: '面试官', text: '请开始。', startSeconds: 1, endSeconds: 3, approximateTime: false },
        { id: 'b1', parentId: 'transcript-root', parentSegmentIndex: 1, speaker: '我', text: '我开始回答。', startSeconds: 4, endSeconds: 8, approximateTime: false },
      ],
    );
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '开场', startSegmentIndex: 0, endSegmentIndex: 1, format: 'group-topic',
      turns: [
        { speaker: '面试官', text: '请开始。', role: 'facilitator', startSegmentIndex: 0, endSegmentIndex: 0 },
        { speaker: '候选人', text: '我开始回答。', role: 'participant', startSegmentIndex: 1, endSegmentIndex: 1 },
      ],
    }] }), chunks[0]);
    expect(pairs[0].evidenceBlockIds).toEqual(['b0', 'b1']);
    expect(pairs[0].turns?.map((turn) => turn.evidenceBlockIds)).toEqual([['b0'], ['b1']]);
  });

  it('splits an oversized model turn back into readable timed pieces', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 5, timeLabel: '00:05', text: '第一段'.repeat(45) },
      { index: 1, sourceSegmentIndex: 0, startSeconds: 20, timeLabel: '00:20', text: '第二段'.repeat(45) },
      { index: 2, sourceSegmentIndex: 0, startSeconds: 35, timeLabel: '00:35', text: '第三段'.repeat(45) },
    ];
    const longText = segments.map((segment) => segment.text).join('');
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '试讲', startSegmentIndex: 0, endSegmentIndex: 2, format: 'group-topic',
      turns: [{ speaker: '候选人', text: longText, role: 'participant', startSegmentIndex: 0, endSegmentIndex: 2 }],
    }] }), segments);
    expect(pairs[0].turns).toHaveLength(3);
    expect(pairs[0].turns?.map((turn) => turn.startSeconds)).toEqual([5, 20, 35]);
  });

  it('maps structured pairs back to audio time', () => {
    const segments = [
      { index: 3, sourceSegmentIndex: 3, startSeconds: 42, timeLabel: '00:42', text: '请介绍项目' },
      { index: 4, sourceSegmentIndex: 4, startSeconds: 50, timeLabel: '00:50', text: '我负责检索模块' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{ question: '介绍项目。', answer: '我负责检索模块。', startSegmentIndex: 3, endSegmentIndex: 4, confidence: 'high' }] }), segments);
    expect(pairs[0]).toMatchObject({ answer: '我负责检索模块。', startSeconds: 42, endSeconds: 50, sourceSegmentIndexes: [3, 4] });
  });

  it('accepts JSON wrapped in reasoning text and code fences', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 3, timeLabel: '00:03', text: '请自我介绍' },
    ];
    const pairs = parseTranscriptQaResponse('<think>分析过程</think>\n```json\n{"pairs":[{"question":"请自我介绍","startSegmentIndex":0,"endSegmentIndex":0}]}\n```', segments);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].startSeconds).toBe(3);
  });

  it('maps split pieces back to the original transcript segment', () => {
    const segments = [
      { index: 8, sourceSegmentIndex: 2, startSeconds: 30, timeLabel: '00:30', text: '问题' },
      { index: 9, sourceSegmentIndex: 2, startSeconds: 35, timeLabel: '00:35', text: '回答' },
    ];
    const pairs = parseTranscriptQaResponse('{"pairs":[{"question":"问题","answer":"回答","startSegmentIndex":8,"endSegmentIndex":9}]}', segments);
    expect(pairs[0].sourceSegmentIndexes).toEqual([2]);
  });

  it('keeps every group-interview speaker turn separate and time-addressable', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 5, timeLabel: '00:05', text: '主持人：请讨论方案' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 18, timeLabel: '00:18', text: '说话人 A：建议先明确目标' },
      { index: 2, sourceSegmentIndex: 2, startSeconds: 31, timeLabel: '00:31', text: '说话人 B：补充风险清单' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '方案讨论',
      answer: '围绕目标和风险展开。',
      startSegmentIndex: 0,
      endSegmentIndex: 2,
      format: 'group-topic',
      turns: [
        { speaker: '主持人', text: '请讨论方案。', role: 'facilitator', startSegmentIndex: 0, endSegmentIndex: 0 },
        { speaker: '说话人 A', text: '建议先明确目标。', role: 'participant', startSegmentIndex: 1, endSegmentIndex: 1 },
        { speaker: '说话人 B', text: '补充风险清单。', role: 'self', startSegmentIndex: 2, endSegmentIndex: 2 },
      ],
    }] }), segments);
    expect(pairs[0].format).toBe('group-topic');
    expect(pairs[0].turns).toMatchObject([
      { speaker: '面试官', role: 'facilitator', startSeconds: 5 },
      { speaker: '候选人', role: 'participant', startSeconds: 18 },
      { speaker: '我', role: 'self', startSeconds: 31 },
    ]);
  });

  it('never exposes invented teacher or host identities in multi-person interviews', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 3, timeLabel: '00:03', text: '老师：请开始试讲' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 12, timeLabel: '00:12', text: '讲师：今天演示函数结构' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '试讲', startSegmentIndex: 0, endSegmentIndex: 1, format: 'group-topic',
      turns: [
        { speaker: '主持人', text: '请开始试讲。', role: 'facilitator', startSegmentIndex: 0, endSegmentIndex: 0 },
        { speaker: '讲师曹向龙', text: '今天演示函数结构。', role: 'participant', startSegmentIndex: 1, endSegmentIndex: 1 },
      ],
    }] }), segments);
    expect(pairs[0].turns?.map((turn) => turn.speaker)).toEqual(['面试官', '候选人']);
  });

  it('restores source text omitted by a weak model in a 1v1 interview', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 10, timeLabel: '00:10', text: '请自我介绍' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 20, timeLabel: '00:20', text: '我负责检索模块' },
      { index: 2, sourceSegmentIndex: 2, startSeconds: 40, timeLabel: '00:40', text: '为什么离职' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({
      pairs: [{ question: '请自我介绍', answer: '我负责检索模块', startSegmentIndex: 0, endSegmentIndex: 1 }],
    }), segments);
    expect(pairs.flatMap((pair) => pair.sourceSegmentIndexes)).toEqual([0, 1, 2]);
    expect(pairs.some((pair) => pair.answer?.includes('为什么离职'))).toBe(true);
  });

  it('preserves missing group-interview evidence as an explicit review turn', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 10, timeLabel: '00:10', text: '请自我介绍' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 20, timeLabel: '00:20', text: '候选人回答' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '开场', startSegmentIndex: 0, endSegmentIndex: 0, format: 'group-topic',
      turns: [{ speaker: '面试官', text: '请自我介绍', role: 'facilitator', startSegmentIndex: 0, endSegmentIndex: 0 }],
    }] }), segments, 0, 'group');
    expect(pairs).toHaveLength(2);
    expect(pairs[1]).toMatchObject({ question: '待核对对话', confidence: 'low', format: 'group-topic' });
    expect(pairs[1].turns).toMatchObject([{ speaker: '身份待确认', role: 'unknown', text: '候选人回答' }]);
  });

  it('corrects a candidate teaching demo that a weak model labels as interviewer speech', () => {
    const segments = [{
      index: 0, sourceSegmentIndex: 0, startSeconds: 0, timeLabel: '00:00',
      text: '各位同学今天要学习函数结构，我们先来看输入输出语句，然后进入编程练习。',
    }];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '候选人编程试讲', startSegmentIndex: 0, endSegmentIndex: 0, format: 'group-topic',
      turns: [{ speaker: '面试官', text: segments[0].text.repeat(2), role: 'facilitator', startSegmentIndex: 0, endSegmentIndex: 0 }],
    }] }), segments, 0, 'group');
    expect(pairs[0].turns?.[0]).toMatchObject({ speaker: '候选人', role: 'participant' });
  });

  it('names recovered 1v1 content from its business topic', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 10, timeLabel: '00:10', text: '面试官介绍 AI 盒子产品' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 20, timeLabel: '00:20', text: '讨论把 ERP 数据接入本地算力盒子' },
    ];
    const pairs = parseTranscriptQaResponse('{"pairs":[]}', segments);
    expect(pairs[0].question).toBe('AI 盒子与 ERP 集成场景');
  });

  it('falls back to referenced source text when the model rewrites most of the source', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 10, timeLabel: '00:10', text: '候选人详细介绍了财务系统的需求沟通和上线过程' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 30, timeLabel: '00:30', text: '面试官继续追问客户冲突如何处理' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [{
      question: '项目经历',
      answer: '候选人能力很好。',
      startSegmentIndex: 0,
      endSegmentIndex: 1,
    }] }), segments);
    expect(pairs[0].answer).toBe(segments.map((segment) => segment.text).join('\n'));
    expect(pairs[0].confidence).toBe('low');
  });

  it('accepts multiple questions only when they cover the complete chunk', () => {
    const segments = [
      { index: 0, sourceSegmentIndex: 0, startSeconds: 10, timeLabel: '00:10', text: '请自我介绍' },
      { index: 1, sourceSegmentIndex: 1, startSeconds: 20, timeLabel: '00:20', text: '我负责检索模块' },
      { index: 2, sourceSegmentIndex: 2, startSeconds: 40, timeLabel: '00:40', text: '为什么离职' },
      { index: 3, sourceSegmentIndex: 3, startSeconds: 50, timeLabel: '00:50', text: '希望寻找更匹配的方向' },
    ];
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: [
      { question: '请自我介绍', answer: '我负责检索模块', startSegmentIndex: 0, endSegmentIndex: 1 },
      { question: '为什么离职', answer: '希望寻找更匹配的方向', startSegmentIndex: 2, endSegmentIndex: 3 },
    ] }), segments);
    expect(pairs.map((pair) => pair.question)).toEqual(['请自我介绍', '为什么离职']);
  });

  it('deterministically merges a fragmented weak-model result without another request', () => {
    const segments = Array.from({ length: 4 }, (_, index) => ({
      index,
      sourceSegmentIndex: index,
      startSeconds: index * 20,
      timeLabel: `00:${String(index * 20).padStart(2, '0')}`,
      text: `第${index + 1}段内容`,
    }));
    const pairs = parseTranscriptQaResponse(JSON.stringify({ pairs: segments.map((segment) => ({
      question: segment.text,
      answer: segment.text,
      startSegmentIndex: segment.index,
      endSegmentIndex: segment.index,
    })) }), segments);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({ startSeconds: 0, endSeconds: 20 });
    expect(pairs[1]).toMatchObject({ startSeconds: 40, endSeconds: 60 });
    expect(pairs.flatMap((pair) => pair.sourceSegmentIndexes)).toEqual([0, 1, 2, 3]);
  });

  it('disables thinking and never retries an empty model response', async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '', reasoning_content: '只进行了思考' }, finish_reason: 'length' }],
    }), { status: 200 }) as unknown as Awaited<ReturnType<typeof fetch>>);

    await expect(organizeInterviewTranscript({
      transcript: '[00:10] 请介绍项目\n[00:20] 我负责检索模块',
      durationSeconds: 60,
      settings: { reviewUrl: 'https://example.com', reviewModel: 'Qwen/Qwen3.5-397B-A17B' } as never,
      apiKey: 'test-key',
    })).rejects.toThrow('输出达到长度上限');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(mockedFetch.mock.calls[0][1]?.body));
    expect(request.enable_thinking).toBe(false);
  });
});

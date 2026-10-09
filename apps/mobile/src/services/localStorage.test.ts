import { beforeEach, describe, expect, it, vi } from 'vitest';

const getItem = vi.fn();
const setItem = vi.fn();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem, setItem } }));

describe('loadPersistedAppState', () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
  });

  it('migrates interrupted and legacy interview drafts to resumable defaults', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      selectedInterviewId: 7,
      interviewDrafts: {
        7: {
          transcriptionState: 'processing',
          transcriptOrganizationState: 'processing',
          transcriptOrganizationCompletedChunks: 2,
          transcriptOrganizationTotalChunks: 5,
          transcript: '已完成片段',
        },
      },
    }));
    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();
    expect(state?.interviewDrafts[7]).toMatchObject({
      interviewMode: 'individual',
      selfSpeakerLabel: '',
      transcriptionState: 'failed',
      transcriptOrganizationState: 'failed',
      transcriptOrganizationCompletedChunks: 2,
      transcriptOrganizationTotalChunks: 5,
      transcriptOrganizationError: '应用关闭后整理已暂停，已完成内容和进度均已保留。',
      transcript: '已完成片段',
      reviewScores: {},
      reviewQuestionDetails: [],
      reviewActionItems: [],
      reviewProgressComparedWithPast: '',
      reviewRecurringPatterns: [],
    });
    expect(state?.userInterviewProfile).toMatchObject({ stableStrengths: [], recurringRisks: [], currentFocus: [], evidence: [] });
  });

  it('keeps only demo interviews that contain user-created work', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      selectedInterviewId: 101,
      interviewDrafts: {
        101: { savedAudioUri: 'file:///recordings/interview.m4a', transcript: '真实面试转写' },
      },
    }));

    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();

    expect(state?.customInterviews.map((interview) => interview.id)).toEqual([101]);
    expect(state?.customJobs.map((job) => job.id)).toEqual([1]);
    expect(state?.interviewDrafts[101].savedAudioUri).toBe('file:///recordings/interview.m4a');
  });

  it('retains the old review and original evidence when a regeneration is interrupted', async () => {
    getItem.mockResolvedValue(JSON.stringify({ interviewDrafts: { 7: {
      reviewGenerationState: 'processing', reviewOverall: '原来的总体判断', reviewStrengths: '原来的优势',
      reviewQuestionDetails: [{ question: '项目经历', answerSummary: '实际回答', score: 3, feedback: '补充指标', evidenceTime: '42:30' }],
      transcript: '[42:30] 嗯，我的原始回答', savedAudioUri: 'file:///recordings/original.aac',
    } } }));
    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();
    expect(state?.interviewDrafts[7]).toMatchObject({
      reviewGenerationState: 'failed', reviewOverall: '原来的总体判断', reviewStrengths: '原来的优势',
      transcript: '[42:30] 嗯，我的原始回答', savedAudioUri: 'file:///recordings/original.aac',
      reviewQuestionDetails: [{ evidenceTime: '42:30' }],
    });
    expect(state?.interviewDrafts[7].reviewGenerationError).toContain('中断');
  });

  it('does not migrate untouched demo records into real statistics', async () => {
    getItem.mockResolvedValue(JSON.stringify({ selectedInterviewId: 0 }));

    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();

    expect(state?.customJobs).toEqual([]);
    expect(state?.customInterviews).toEqual([]);
  });

  it('migrates resume content and HR answer records without losing old resumes', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      resumeVersions: [{ id: 1, name: '旧简历', targetRole: '后端', keywords: [], fileName: 'resume.pdf' }],
    }));
    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();
    expect(state?.resumeVersions[0]).toMatchObject({ name: '旧简历', fileName: 'resume.pdf', content: '' });
    expect(state?.hrAnswerRecords).toEqual({});
    expect(state?.jobResearchItems).toEqual({});
    expect(state?.archivedJobs).toEqual({});
  });

  it('loads archived jobs and saved research items without affecting older data', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      archivedJobs: { 9: '2026-07-31T12:00:00.000Z' },
      jobResearchItems: { 9: [{ id: 'source-1', source: 'xiaohongshu', title: '用户评价', url: 'https://example.com', note: '需要核实', createdAt: '2026-07-31T12:00:00.000Z' }] },
    }));
    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();
    expect(state?.archivedJobs[9]).toContain('2026-07-31');
    expect(state?.jobResearchItems[9]?.[0]).toMatchObject({ source: 'xiaohongshu', note: '需要核实' });
  });

  it('keeps the readable QA answer alongside original transcript indexes', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      selectedInterviewId: 7,
      interviewDrafts: {
        7: {
          transcript: '[00:10] 问题\n[00:20] 回答原文',
          transcriptQaPairs: [{
            id: 'qa-1',
            question: '问题',
            answer: '重复的回答文本',
            startSeconds: 10,
            endSeconds: 20,
            confidence: 'high',
            sourceSegmentIndexes: [0, 1],
          }],
        },
      },
    }));

    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();

    expect(state?.interviewDrafts[7].transcriptQaPairs[0]).toMatchObject({
      answer: '重复的回答文本',
      sourceSegmentIndexes: [0, 1],
    });
    expect(state?.interviewDrafts[7].transcript).toContain('回答原文');
  });

  it('repairs a partially organized group interview without another model request', async () => {
    getItem.mockResolvedValue(JSON.stringify({
      selectedInterviewId: 9,
      interviewDrafts: {
        9: {
          interviewMode: 'group',
          audioDurationMillis: 120000,
          transcript: '[00:00] 同学们今天学习变量。\n[01:00] 我本科就读于计算机专业。',
          transcriptEvidenceBlocks: [
            { id: 'b0', parentId: 'transcript-root', parentSegmentIndex: 0, speaker: '转写片段', text: '同学们今天学习变量和输入输出结构。', startSeconds: 0, endSeconds: 60, approximateTime: false },
            { id: 'b1', parentId: 'transcript-root', parentSegmentIndex: 1, speaker: '转写片段', text: '我本科就读于计算机专业。', startSeconds: 60, endSeconds: 120, approximateTime: false },
          ],
          transcriptQaPairs: [{
            id: 'p0', question: '试讲', startSeconds: 0, endSeconds: 0, confidence: 'high', sourceSegmentIndexes: [0], evidenceBlockIds: ['b0'], format: 'group-topic',
            turns: [{ id: 't0', speaker: '面试官', text: '同学们今天学习变量和输入输出结构。', role: 'facilitator', startSeconds: 0, sourceSegmentIndexes: [0], evidenceBlockIds: ['b0'] }],
          }],
          transcriptOrganizationState: 'failed',
          transcriptOrganizationError: '覆盖率不足',
        },
      },
    }));

    const { loadPersistedAppState } = await import('./localStorage');
    const state = await loadPersistedAppState();
    const draft = state?.interviewDrafts[9];
    expect(draft?.transcriptOrganizationState).toBe('completed');
    expect(draft?.transcriptOrganizationError).toBe('');
    expect(draft?.transcriptQaPairs.flatMap((pair) => pair.evidenceBlockIds)).toEqual(expect.arrayContaining(['b0', 'b1']));
    expect(draft?.transcriptQaPairs[0].turns?.[0]).toMatchObject({ speaker: '候选人', role: 'participant' });
  });

  it('persists an OCR-created interview, linked job, and imported details across restart', async () => {
    let stored = '';
    setItem.mockImplementation(async (_key: string, value: string) => { stored = value; });
    const { loadPersistedAppState, savePersistedAppState } = await import('./localStorage');
    await savePersistedAppState({
      selectedInterviewId: 301,
      customJobs: [{ id: 201, company: '瞬康科技', title: 'FDE前线工程师', platform: '截图导入', city: '广州', status: 'interviewing', salary: '8-12K', tags: [], resume: '默认简历' }],
      customInterviews: [{ id: 301, jobId: 201, company: '瞬康科技', title: 'FDE前线工程师', round: '一面', type: '现场', startsAt: '2026-07-17 15:30', status: '待反馈', audioState: '未录音', jdSummary: '', checklist: [] }],
      jobNotes: { 201: { screenshotName: 'interview.jpg', applicationSource: '招聘截图 OCR', recruiterName: '容女士 · HR', note: '面试地址：广州番禺区', jdSummary: '' } },
      interviewDrafts: { 301: { interviewerName: '容女士', interviewerTitle: 'HR', note: '面试地址：广州番禺区', transcriptionState: 'idle', preparationMaterials: [] } },
      customInterviewsCount: 1,
    } as never);
    getItem.mockResolvedValue(stored);

    const state = await loadPersistedAppState();
    expect(state?.customInterviews[0]).toMatchObject({ id: 301, jobId: 201, status: '待反馈' });
    expect(state?.customJobs[0]).toMatchObject({ id: 201, status: 'interviewing' });
    expect(state?.jobNotes[201]).toMatchObject({ recruiterName: '容女士 · HR', note: '面试地址：广州番禺区' });
    expect(state?.interviewDrafts[301]).toMatchObject({ interviewerName: '容女士', interviewerTitle: 'HR' });
  });
});

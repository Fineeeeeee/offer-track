import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AiServiceSettings, JobNote, PersistedAppState, PreparationMaterial, TranscriptQaPair, UserPreferences } from '../types';
import { interviews as legacyDemoInterviews, jobs as legacyDemoJobs } from '../data/mockData';
import { emptyInterviewProfile } from '../domain/interviewProfile';
import { buildTranscriptEvidenceBlocks } from '../domain/transcriptEvidence';
import { finalizeGroupTranscriptOrganization, normalizeGroupTurnRole, normalizeTranscriptTopicTitle } from '../domain/transcriptOrganizationNormalization';
import { evaluateTranscriptOrganizationQuality } from '../domain/transcriptOrganizationQuality';

const APP_STATE_KEY = 'offer-jing:mobile-state:v1';
let saveQueue: Promise<void> = Promise.resolve();

const emptyJobNote: JobNote = {
  jobUrl: '',
  workMode: '',
  direction: '',
  companySize: '',
  experience: '',
  education: '',
  intentScore: '',
  sourceConfidence: '',
  screenshotName: '',
  applicationSource: '',
  recordGroup: '',
  contactMethod: '',
  recruiterName: '',
  applicationDate: '',
  recordDate: '',
  recordTime: '',
  recruitmentState: '',
  endReason: '',
  jdSummary: '',
  nextAction: '',
  note: '',
  offerBaseSalary: '',
  offerBonus: '',
  offerTotalPackage: '',
  offerProbation: '',
  offerStartDate: '',
  offerBenefits: '',
  offerRisks: '',
  offerNegotiation: '',
  offerDecision: '',
};

const defaultUserPreferences: UserPreferences = {
  targetDirections: 'AI 应用 / FDE / 后端工程',
  preferredCities: '广州、深圳、远程',
  currentStrategy: '优先推进已回复职位，再补齐高匹配 JD',
  reminderNote: '面试提醒和跟进提醒先记录在本地文本中',
};

const defaultAiServiceSettings: AiServiceSettings = {
  transcriptionProvider: 'local-sensevoice',
  transcriptionUrl: '',
  transcriptionModel: 'Qwen/Qwen3-Omni-30B-A3B-Instruct',
  tencentEngineType: '16k_zh_en',
  reviewUrl: '',
  reviewModel: '',
  ocrUrl: '',
  ocrModel: '',
  researchMcpUrl: '',
};

function normalizeAiServiceSettings(settings: Partial<AiServiceSettings> | undefined): AiServiceSettings {
  const merged = { ...defaultAiServiceSettings, ...(settings ?? {}) };
  if (merged.transcriptionUrl.includes('siliconflow')) {
    merged.transcriptionUrl = merged.transcriptionUrl.replace('/audio/transcriptions', '/chat/completions');
    merged.transcriptionModel = 'Qwen/Qwen3-Omni-30B-A3B-Instruct';
  }
  return merged;
}

export async function loadPersistedAppState(): Promise<PersistedAppState | null> {
  const raw = await AsyncStorage.getItem(APP_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const state = JSON.parse(raw) as Partial<PersistedAppState>;
    const legacyDraft =
      state.savedAudioUri || state.savedAudioName || state.transcript || state.note
        ? {
            [state.selectedInterviewId ?? 101]: {
              savedAudioUri: state.savedAudioUri ?? null,
              savedAudioName: state.savedAudioName ?? null,
              audioDurationMillis: 0,
              audioMimeType: '',
              recordingHealth: 'unknown' as const,
              transcriptionState: 'idle' as const,
              transcriptionProvider: '' as const,
              transcriptionError: '',
              transcriptionUpdatedAt: '',
              transcriptionCompletedParts: 0,
              transcriptionTotalParts: 0,
              audioWorkState: state.audioWorkState ?? 'empty',
              transcript: state.transcript ?? '',
              transcriptEvidenceBlocks: buildTranscriptEvidenceBlocks(state.transcript ?? '', 0),
              transcriptQaPairs: [],
              transcriptOrganizationState: 'idle' as const,
              transcriptOrganizationError: '',
              transcriptOrganizationUpdatedAt: '',
              note: state.note ?? '',
              interviewerName: '',
              interviewerTitle: '',
              endAt: '',
              selfIntroduction: '',
              projectStories: '',
              companyResearch: '',
              roleUnderstanding: '',
              manualQuestions: '',
              improvedAnswer: '',
              reviewOverall: '',
              reviewStrengths: '',
              reviewRisks: '',
              reviewScores: {},
              reviewQuestionDetails: [],
              reviewActionItems: [],
              questionsForInterviewer: '',
              followUpAction: '',
              reminderAt: '',
              recordMarkers: [],
              preparationMaterials: [],
            },
          }
        : {};

    const interviewDrafts = Object.fromEntries(
      Object.entries(state.interviewDrafts ?? legacyDraft).map(([id, draft]) => {
        const evidenceBlocks = draft.transcriptEvidenceBlocks?.length
          ? draft.transcriptEvidenceBlocks
          : buildTranscriptEvidenceBlocks(draft.transcript ?? '', Math.max(0, (draft.audioDurationMillis ?? 0) / 1000));
        const normalizedPairs = normalizeTranscriptQaPairs(draft.transcriptQaPairs ?? []);
        const finalizedPairs = draft.interviewMode === 'group' && normalizedPairs.length
          ? finalizeGroupTranscriptOrganization(normalizedPairs, evidenceBlocks)
          : normalizedPairs;
        const repairedGroupOrganization = draft.interviewMode === 'group' && finalizedPairs.length
          ? evaluateTranscriptOrganizationQuality(finalizedPairs, evidenceBlocks, Math.max(0, (draft.audioDurationMillis ?? 0) / 1000), 'group')
          : null;
        return [id, {
          ...draft,
          interviewMode: draft.interviewMode ?? 'individual',
          selfSpeakerLabel: draft.selfSpeakerLabel ?? '',
          audioDurationMillis: draft.audioDurationMillis ?? 0,
          audioMimeType: draft.audioMimeType ?? '',
          recordingHealth: draft.recordingHealth ?? 'unknown',
          transcriptionState: draft.transcriptionState === 'processing' ? 'failed' : draft.transcriptionState ?? 'idle',
          transcriptionProvider: draft.transcriptionProvider ?? '',
          transcriptionError:
            draft.transcriptionState === 'processing'
              ? '上次转写在应用退出时中断，请重新开始。'
              : draft.transcriptionError ?? '',
          transcriptionUpdatedAt: draft.transcriptionUpdatedAt ?? '',
          transcriptionCompletedParts: draft.transcriptionCompletedParts ?? 0,
          transcriptionTotalParts: draft.transcriptionTotalParts ?? 0,
          transcriptEvidenceBlocks: evidenceBlocks,
          transcriptQaPairs: finalizedPairs,
          transcriptOrganizationState: draft.transcriptOrganizationState === 'processing'
            ? 'failed'
            : repairedGroupOrganization?.passed
              ? 'completed'
              : draft.transcriptOrganizationState ?? 'idle',
          transcriptOrganizationError: draft.transcriptOrganizationState === 'processing'
            ? '应用关闭后整理已暂停，已完成内容和进度均已保留。'
            : repairedGroupOrganization?.passed
              ? ''
              : draft.transcriptOrganizationError ?? '',
          transcriptOrganizationUpdatedAt: draft.transcriptOrganizationUpdatedAt ?? '',
          transcriptOrganizationCompletedChunks: draft.transcriptOrganizationCompletedChunks ?? 0,
          transcriptOrganizationTotalChunks: draft.transcriptOrganizationTotalChunks ?? 0,
          interviewerName: draft.interviewerName ?? '',
          interviewerTitle: draft.interviewerTitle ?? '',
          endAt: draft.endAt ?? '',
          selfIntroduction: draft.selfIntroduction ?? '',
          projectStories: draft.projectStories ?? '',
          companyResearch: draft.companyResearch ?? '',
          roleUnderstanding: draft.roleUnderstanding ?? '',
          manualQuestions: draft.manualQuestions ?? '',
          improvedAnswer: draft.improvedAnswer ?? '',
          reviewOverall: draft.reviewOverall ?? '',
          reviewStrengths: draft.reviewStrengths ?? '',
          reviewRisks: draft.reviewRisks ?? '',
          reviewScores: draft.reviewScores ?? {},
          reviewQuestionDetails: draft.reviewQuestionDetails ?? [],
          reviewActionItems: draft.reviewActionItems ?? [],
          reviewProgressComparedWithPast: draft.reviewProgressComparedWithPast ?? '',
          reviewRecurringPatterns: draft.reviewRecurringPatterns ?? [],
          reviewGenerationState: draft.reviewGenerationState === 'processing'
            ? 'failed'
            : draft.reviewGenerationState ?? (draft.reviewOverall ? 'completed' : 'idle'),
          reviewGenerationError: draft.reviewGenerationState === 'processing'
            ? '上次 AI 复盘在应用退出时中断，可重新生成。'
            : draft.reviewGenerationError ?? '',
          reviewGenerationUpdatedAt: draft.reviewGenerationUpdatedAt ?? '',
          questionsForInterviewer: draft.questionsForInterviewer ?? '',
          followUpAction: draft.followUpAction ?? '',
          reminderAt: draft.reminderAt ?? '',
          recordMarkers: draft.recordMarkers ?? [],
          preparationMaterials: normalizePreparationMaterials(draft),
        }];
      }),
    );
    const jobNotes = Object.fromEntries(
      Object.entries(state.jobNotes ?? {}).map(([id, note]) => [
        id,
        {
          ...emptyJobNote,
          ...note,
        },
      ]),
    );
    const resumeVersions = (state.resumeVersions ?? []).map((resume) => ({
      ...resume,
      name: migrateBuiltInResumeName(resume.name),
      fileName: resume.fileName ?? '',
      content: resume.content ?? '',
    }));
    const migratedLegacyRecords = migrateUsedLegacyDemoRecords(state, interviewDrafts);
    const customJobs = [...(state.customJobs ?? []), ...migratedLegacyRecords.jobs]
      .filter((job, index, items) => items.findIndex((item) => item.id === job.id) === index)
      .map((job) => ({ ...job, resume: migrateBuiltInResumeName(job.resume) }));
    const customInterviews = [...(state.customInterviews ?? []), ...migratedLegacyRecords.interviews]
      .filter((interview, index, items) => items.findIndex((item) => item.id === interview.id) === index);
    const jobEdits = Object.fromEntries(Object.entries(state.jobEdits ?? {}).map(([id, edit]) => [
      id,
      edit.resume ? { ...edit, resume: migrateBuiltInResumeName(edit.resume) } : edit,
    ]));
    const jobResumeOverrides = Object.fromEntries(Object.entries(state.jobResumeOverrides ?? {}).map(([id, name]) => [
      id,
      migrateBuiltInResumeName(name),
    ]));
    const hrAnswerRecords = Object.fromEntries(Object.entries(state.hrAnswerRecords ?? {}).map(([id, records]) => [
      id,
      records.map((record) => ({ ...record, resumeName: migrateBuiltInResumeName(record.resumeName) })),
    ]));

    return {
      selectedInterviewId: state.selectedInterviewId ?? 0,
      hasConfirmedRecordingCompliance: state.hasConfirmedRecordingCompliance ?? false,
      userPreferences: {
        ...defaultUserPreferences,
        ...(state.userPreferences ?? {}),
      },
      userInterviewProfile: {
        ...emptyInterviewProfile,
        ...(state.userInterviewProfile ?? {}),
        stableStrengths: state.userInterviewProfile?.stableStrengths ?? [],
        recurringRisks: state.userInterviewProfile?.recurringRisks ?? [],
        currentFocus: state.userInterviewProfile?.currentFocus ?? [],
        evidence: state.userInterviewProfile?.evidence ?? [],
      },
      aiServiceSettings: normalizeAiServiceSettings(state.aiServiceSettings),
      customJobs,
      customInterviews,
      jobEdits,
      interviewEdits: state.interviewEdits ?? {},
      hiddenJobIds: state.hiddenJobIds ?? [],
      hiddenInterviewIds: state.hiddenInterviewIds ?? [],
      resumeVersions,
      hrAnswerRecords,
      jobResearchItems: state.jobResearchItems ?? {},
      archivedJobs: state.archivedJobs ?? {},
      archivedInterviews: state.archivedInterviews ?? {},
      jobResumeOverrides,
      jobNotes,
      jobEvents: state.jobEvents ?? {},
      interviewChecklistDone: state.interviewChecklistDone ?? {},
      interviewDrafts,
      interviewResults: state.interviewResults ?? {},
      savedAudioUri: state.savedAudioUri ?? null,
      savedAudioName: state.savedAudioName ?? null,
      audioWorkState: state.audioWorkState ?? 'empty',
      transcript: state.transcript ?? '',
      note: state.note ?? '',
      jobStatusOverrides: state.jobStatusOverrides ?? {},
      interviewAudioStates: state.interviewAudioStates ?? {},
      mockInterviewSessions: state.mockInterviewSessions ?? [],
    };
  } catch {
    return null;
  }
}

function migrateUsedLegacyDemoRecords(
  state: Partial<PersistedAppState>,
  interviewDrafts: PersistedAppState['interviewDrafts'],
) {
  const existingInterviewIds = new Set((state.customInterviews ?? []).map((interview) => interview.id));
  const existingJobIds = new Set((state.customJobs ?? []).map((job) => job.id));
  const interviews = legacyDemoInterviews.filter((interview) => {
    if (existingInterviewIds.has(interview.id)) return false;
    const draft = interviewDrafts[interview.id];
    return Boolean(
      hasMeaningfulInterviewDraft(draft)
      || state.interviewEdits?.[interview.id]
      || state.interviewResults?.[interview.id]
      || state.interviewChecklistDone?.[interview.id]?.length
      || state.interviewAudioStates?.[interview.id],
    );
  });
  const requiredJobIds = new Set(interviews.map((interview) => interview.jobId));
  const jobs = legacyDemoJobs.filter((job) => requiredJobIds.has(job.id) && !existingJobIds.has(job.id));
  return { interviews, jobs };
}

function hasMeaningfulInterviewDraft(draft: PersistedAppState['interviewDrafts'][number] | undefined) {
  if (!draft) return false;
  return Boolean(
    draft.savedAudioUri
    || draft.savedAudioName
    || draft.transcript?.trim()
    || draft.note?.trim()
    || draft.reviewOverall?.trim()
    || draft.reviewStrengths?.trim()
    || draft.reviewRisks?.trim()
    || draft.selfIntroduction?.trim()
    || draft.projectStories?.trim()
    || draft.companyResearch?.trim()
    || draft.roleUnderstanding?.trim()
    || draft.manualQuestions?.trim()
    || draft.preparationMaterials?.length
    || draft.recordMarkers?.length,
  );
}

function migrateBuiltInResumeName(value: string) {
  const names: Record<string, string> = {
    fde_ai_v3: 'AI 解决方案简历',
    ai_app_v2: 'AI 应用简历',
    backend_v1: '后端工程简历',
  };
  return names[value.trim().toLowerCase()] ?? value;
}

function normalizePreparationMaterials(draft: Partial<PersistedAppState['interviewDrafts'][number]>) {
  if (draft.preparationMaterials?.length) {
    return draft.preparationMaterials;
  }

  const legacy: PreparationMaterial[] = [
    { id: 'legacy-intro', kind: 'intro', title: '自我介绍', body: draft.selfIntroduction ?? '', importance: 'high' },
    { id: 'legacy-project', kind: 'project', title: '项目案例', body: draft.projectStories ?? '', importance: 'high' },
    { id: 'legacy-company', kind: 'company', title: '公司研究', body: draft.companyResearch ?? '', importance: 'normal' },
    { id: 'legacy-role', kind: 'role', title: '岗位理解', body: draft.roleUnderstanding ?? '', importance: 'normal' },
  ];
  return legacy.filter((item) => item.body.trim());
}

function normalizeTranscriptQaPairs(pairs: TranscriptQaPair[]) {
  return pairs.map((pair) => {
    if (!pair.sourceSegmentIndexes?.length) return pair;
    const content = pair.answer || pair.turns?.map((turn) => turn.text).join('\n') || '';
    const question = normalizeTranscriptTopicTitle(pair.question, content);
    return {
      id: pair.id,
      question,
      answer: pair.answer?.trim() || undefined,
      startSeconds: pair.startSeconds,
      endSeconds: pair.endSeconds,
      confidence: pair.confidence,
      sourceSegmentIndexes: pair.sourceSegmentIndexes,
      evidenceBlockIds: pair.evidenceBlockIds,
      format: pair.format,
      turns: pair.turns?.map((turn) => {
        const role = normalizeGroupTurnRole(turn.role, question, turn.text);
        return {
          ...turn,
          role,
          speaker: role === 'participant' && turn.speaker === '面试官' ? '候选人' : turn.speaker,
          evidenceBlockIds: turn.evidenceBlockIds,
        };
      }),
    } satisfies TranscriptQaPair;
  });
}

export function savePersistedAppState(state: PersistedAppState) {
  const serializedState = JSON.stringify(state);
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(APP_STATE_KEY, serializedState));
  return saveQueue;
}

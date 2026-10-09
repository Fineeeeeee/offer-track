import { StatusBar } from 'expo-status-bar';
import {
  getRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Linking,
  Modal,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text, AppTextInput as TextInput } from './src/components/AppText';
import { AppIcon } from './src/components/AppIcon';
import { AppPressable as Pressable, triggerAppHaptic } from './src/components/AppPressable';
import { animateNextLayout, FadeInView, PulseView } from './src/components/Motion';
import { AdaptiveGrid, ResponsiveRow, useResponsiveLayout } from './src/components/ResponsiveLayout';
import { SheetScaffold } from './src/components/SheetScaffold';
import { ReminderDateTimePicker } from './src/components/ReminderDateTimePicker';
import { HrDemoScreen } from './src/components/HrDemoScreen';
import { InterviewReviewOverview } from './src/components/InterviewReviewOverview';
import {
  ActionRow,
  CompactEmptyState,
  FeatureCard,
  Group,
  ListRow,
  Metric,
  ReviewBlock,
  Section,
  StatusPill,
  TabButton,
} from './src/components/ui';
import { MockInterviewScreen } from './src/features/mockInterview/MockInterviewScreen';
import { JobResearchPanel } from './src/features/jobResearch/JobResearchPanel';
import {
  reviewSeed,
  statusMeta,
  statusOrder,
} from './src/data/mockData';
import {
  buildPresentationData,
  PRESENTATION_INTERVIEW_IDS,
  PRESENTATION_JOB_IDS,
  PRESENTATION_RESUME_ID,
} from './src/data/presentationData';
import { calculateMetrics } from './src/domain/metrics';
import {
  jobStatusFilters,
  matchesJobStatusFilter,
  normalizeCityLabel,
  normalizeJobCity,
  type JobStatusFilter,
} from './src/domain/jobFilters';
import {
  defaultDateRange,
  formatActivityDate,
  getJobDate,
  getJobLifecycleDates,
  isArchiveCandidate,
  isDateInRange,
  parseDateValue,
  type DateRangeValue,
  type JobDateBasis,
} from './src/domain/jobLifecycle';
import {
  formatInterviewCountdown,
  formatInterviewDateChoice,
  formatInterviewDateTimeStorage,
  formatInterviewSchedule,
  getDefaultInterviewDateTime,
  normalizeInterviewDateTime,
  resolveInterviewDateTime,
} from './src/domain/interviewDateTime';
import { buildAudioAuditPoints, diagnoseAudioFile } from './src/domain/audioDiagnostics';
import {
  bindAudioPlaybackSnapshot,
  selectAudioPlaybackSnapshot,
  type BoundAudioPlaybackSnapshot,
} from './src/domain/audioPlaybackState';
import { evaluateRecordingStorage, formatStorageSize } from './src/domain/recordingSafety';
import {
  buildPreparationRecommendations,
  excludeExistingRecommendations,
} from './src/domain/preparationRecommendations';
import { omitRecordKeys } from './src/domain/recordUtils';
import {
  buildTranscriptSegments,
  clampPlaybackTarget,
  findActiveTimedItemIndex,
  parseTranscriptTimestamp,
  removeTranscriptSegment,
} from './src/domain/transcriptUtils';
import { buildTranscriptEvidenceBlocks } from './src/domain/transcriptEvidence';
import { formatTranscriptionTaskStatus, getAttentionTranscriptionTasks } from './src/domain/transcriptionTasks';
import { inferNextInterviewRound } from './src/domain/interviewRounds';
import { buildInterviewLinkedJob } from './src/domain/interviewCreation';
import { emptyInterviewProfile, mergeInterviewProfile } from './src/domain/interviewProfile';
import {
  createFreshAudioAnalysisPatch,
  getAudioStateFromWorkState,
  getAudioWorkStateLabel,
  getNextApplicationStatus,
  hasResumableTranscript,
} from './src/domain/status';
import {
  clearActiveRecordingMarker,
  deleteAudioFile,
  getAudioDurationMillis,
  getAudioFileSize,
  getRecordingStorageInfo,
  persistAudioFile,
  recoverActiveRecording,
  saveActiveRecordingMarker,
  updateActiveRecordingSource,
} from './src/services/audioFiles';
import {
  clearAiApiKey,
  clearOcrApiKey,
  clearResearchApiKey,
  clearTencentAsrCredentials,
  loadAiApiKey,
  loadOcrApiKey,
  loadResearchApiKey,
  loadTencentAsrCredentials,
  saveAiApiKey,
  saveOcrApiKey,
  saveResearchApiKey,
  saveTencentAsrCredentials,
} from './src/services/aiCredentials';
import { getServiceBaseUrl } from './src/services/apiEndpoint';
import { canReviewPersonalPerformance, generateInterviewPreparation, getReviewInputIssue, reviewInterviewTranscript, transcribeInterviewAudio } from './src/services/aiService';
import { generateHrAnswer } from './src/services/hrAssistant';
import { formatResearchNote, summarizeJobResearch, type JobResearchSource } from './src/services/jobResearch';
import { exportJobHuntWorkbook } from './src/services/excelExport';
import { shareInterviewReport, type InterviewReportContent } from './src/services/interviewReportExport';
import { createAndShareFullBackup, pickAndRestoreFullBackup } from './src/services/appBackup';
import { clearDisposableCache, inspectDisposableCache, type CacheInspection } from './src/services/cacheMaintenance';
import { loadPersistedAppState, savePersistedAppState } from './src/services/localStorage';
import { clearLongTask, consumeInterruptedLongTask, markLongTaskStarted } from './src/services/longTaskRecovery';
import { configureLocalNotifications, scheduleInterviewReminder, subscribeToInterviewNotificationResponses } from './src/services/notifications';
import { formatDuration, getAudioStateText } from './src/services/playback';
import {
  getNativeAudioPlaybackStatus,
  pauseNativeAudioPlayback,
  seekNativeAudioPlayback,
  supportsNativeAudioPlayback,
  type NativePlaybackStatus,
} from './src/services/nativeAudioPlayback';
import { interviewRecordingOptions } from './src/services/recordingOptions';
import { getSenseVoiceModelStatus, prepareSenseVoiceModel } from './src/services/senseVoice';
import { isLikelySamePosition, recognizeRecruitmentScreenshots, type OcrConfidence } from './src/services/screenshotOcr';
import { testChatServiceConnection } from './src/services/serviceConnection';
import { organizeInterviewTranscript } from './src/services/transcriptOrganization';
import { formatStoredMcpResearchContent, researchJobWithXiaohongshuMcp, resolveStoredMcpResearchTitle, testXiaohongshuMcpConnection, type XiaohongshuResearchProgress } from './src/services/xiaohongshuMcp';
import { styles } from './src/styles';
import { SCREEN_TOP_GAP } from './src/theme';
import type {
  ApplicationStatus,
  ApplicationEvent,
  AiServiceSettings,
  AudioWorkState,
  EndReason,
  Interview,
  InterviewAudioState,
  InterviewDraft,
  InterviewResult,
  Job,
  JobNote,
  JobResearchItem,
  HrAnswerRecord,
  MockInterviewSession,
  PreparationMaterial,
  PreparationMaterialKind,
  PersistedAppState,
  RecordingHealth,
  ResumeVersion,
  TabId,
  TencentAsrCredentials,
  TranscriptQaPair,
  UserPreferences,
  UserInterviewProfile,
} from './src/types';

type HomeSection = 'todo' | 'funnel' | 'insight';
type HomeInsightSection = 'channel' | 'resume' | 'risk';
type JobDetailSection = 'overview' | 'jd' | 'chat' | 'offer' | 'timeline';
type InterviewDetailSection = 'prepare' | 'record' | 'review' | 'followup';
type ReviewContentView = 'overview' | 'evidence' | 'review';
type InterviewListFilter = 'all' | 'upcoming' | 'review' | 'feedback';
type PlaybackRequestState = 'idle' | 'loading' | 'ready' | 'failed';

async function withPlaybackTimeout<T>(operation: Promise<T>, timeoutMillis: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMillis);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
type BatchResearchProgress = {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  completedJobs: number;
  totalJobs: number;
  currentJobId: number | null;
  detail: string;
};
type MeSection = 'main' | 'followups' | 'offers' | 'archive' | 'resumes' | 'preferences' | 'interviewProfile' | 'ai' | 'data' | 'privacy' | 'help';
type HomeMetricKey = 'applied' | 'replyRate' | 'interviewRate' | 'offerRate';
type HomeTodo = {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  priority: '高' | '中' | '低';
  target:
    | { type: 'job'; id: number; section: JobDetailSection }
    | { type: 'interview'; id: number; section: InterviewDetailSection };
};
type ScreenshotJobDraft = {
  id: number;
  kind: 'job';
  job: Job;
  note: Partial<JobNote>;
  confidence?: Record<string, OcrConfidence>;
  duplicateOf?: number;
  duplicateAction?: 'merge' | 'create';
};
type ScreenshotInterviewDraft = {
  id: number;
  kind: 'interview';
  interview: Omit<Interview, 'id' | 'jobId'>;
  sourceFile: string;
  linkedJobId?: number;
  linkedJobTitle?: string;
  willCreateJob: boolean;
  salary: string;
  city: string;
  contactName: string;
  contactTitle: string;
  address: string;
  notes: string;
  confidence?: Record<string, OcrConfidence>;
  duplicateOf?: number;
  duplicateAction?: 'merge' | 'create';
};
type ScreenshotImportDraft = ScreenshotJobDraft | ScreenshotInterviewDraft;

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
const defaultResumeVersions: ResumeVersion[] = [];
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
const endReasonOptions: EndReason[] = [
  '被拒',
  '主动放弃',
  '岗位关闭',
  '长期无回应',
  '薪资不匹配',
  '地点不匹配',
  '已接受其他 Offer',
  '其他',
];
const emptyDraft: InterviewDraft = {
  savedAudioUri: null,
  savedAudioName: null,
  audioDurationMillis: 0,
  audioMimeType: '',
  recordingHealth: 'unknown',
  interviewMode: 'individual',
  selfSpeakerLabel: '',
  transcriptionState: 'idle',
  transcriptionProvider: '',
  transcriptionError: '',
  transcriptionUpdatedAt: '',
  transcriptionCompletedParts: 0,
  transcriptionTotalParts: 0,
  audioWorkState: 'empty',
  transcript: '',
  transcriptEvidenceBlocks: [],
  transcriptQaPairs: [],
  transcriptOrganizationState: 'idle',
  transcriptOrganizationError: '',
  transcriptOrganizationUpdatedAt: '',
  transcriptOrganizationCompletedChunks: 0,
  transcriptOrganizationTotalChunks: 0,
  note: '',
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
  reviewProgressComparedWithPast: '',
  reviewRecurringPatterns: [],
  reviewGenerationState: 'idle',
  reviewGenerationError: '',
  reviewGenerationUpdatedAt: '',
  questionsForInterviewer: '',
  followUpAction: '',
  reminderAt: '',
  recordMarkers: [],
  preparationMaterials: [],
};

const preparationMaterialTemplates: Array<{
  kind: PreparationMaterialKind;
  label: string;
  title: string;
  body: string;
}> = [
  { kind: 'intro', label: '自我介绍', title: '自我介绍', body: '当前背景：\n与岗位的匹配点：\n代表项目与结果：\n选择这次机会的原因：' },
  { kind: 'project', label: '项目案例', title: '项目案例', body: '背景与目标：\n我的任务：\n关键行动：\n结果与数据：\n复盘与延伸：' },
  { kind: 'company', label: '公司研究', title: '公司研究', body: '核心业务与产品：\n目标客户：\n近期变化：\n我认可的部分：\n需要确认的问题：' },
  { kind: 'role', label: '岗位理解', title: '岗位理解', body: '岗位核心目标：\n成功标准：\n我的匹配点：\n当前差距：\n入职后的优先事项：' },
  { kind: 'technical', label: '技术要点', title: '技术要点', body: '核心概念：\n项目中的实际用法：\n常见追问：\n容易遗漏的边界：' },
  { kind: 'questions', label: '反问清单', title: '反问清单', body: '关于业务：\n关于团队：\n关于岗位目标：\n关于成长与反馈：' },
  { kind: 'reminder', label: '临场提醒', title: '临场提醒', body: '回答先说结论。\n项目说明突出自己的动作与结果。\n不确定时明确假设，不编造。' },
  { kind: 'custom', label: '自定义', title: '新材料', body: '' },
];
const interviewResultOptions: InterviewResult[] = ['待反馈', '通过', '未通过', '进入下一轮'];
const interviewFilterOptions: Array<{ value: InterviewListFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'upcoming', label: '待面试' },
  { value: 'review', label: '待复盘' },
  { value: 'feedback', label: '待反馈' },
];

export default function App() {
  const insets = useSafeAreaInsets();
  const { isCompact, isWide } = useResponsiveLayout();
  const [clockTick, setClockTick] = useState(() => Date.now());
  const audioRecorder = useAudioRecorder(interviewRecordingOptions);
  const audioRecorderState = useAudioRecorderState(audioRecorder, 500);
  const lastAudibleAtRef = useRef(0);
  const activeRecordingNameRef = useRef('');
  const recordingLastGrowthAtRef = useRef(0);
  const recordingLastSizeRef = useRef(0);
  const recoveryCheckedRef = useRef(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDurationMillis, setRecordingDurationMillis] = useState(0);
  const [recordingHealth, setRecordingHealth] = useState<RecordingHealth>('unknown');
  const [recordingFileSizeBytes, setRecordingFileSizeBytes] = useState(0);
  const [recordingFreeBytes, setRecordingFreeBytes] = useState(0);
  const [recordingWriteState, setRecordingWriteState] = useState<'checking' | 'writing' | 'waiting'>('checking');
  const [savedAudioFileSizeBytes, setSavedAudioFileSizeBytes] = useState(0);
  const [playbackTargetSeconds, setPlaybackTargetSeconds] = useState<number | null>(null);
  const [playbackRequestState, setPlaybackRequestState] = useState<PlaybackRequestState>('idle');
  const [nativePlaybackStatus, setNativePlaybackStatus] = useState<BoundAudioPlaybackSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [homeSection, setHomeSection] = useState<HomeSection>('todo');
  const [homeInsightSection, setHomeInsightSection] = useState<HomeInsightSection>('channel');
  const [homeMetricDetail, setHomeMetricDetail] = useState<HomeMetricKey | null>(null);
  const [jobDetailSection, setJobDetailSection] = useState<JobDetailSection>('overview');
  const [isEditingJob, setIsEditingJob] = useState(false);
  const [interviewDetailSection, setInterviewDetailSection] = useState<InterviewDetailSection>('prepare');
  const [activeReviewContentView, setActiveReviewContentView] = useState<ReviewContentView>('overview');
  const [meSection, setMeSection] = useState<MeSection>('main');
  const [selectedInterviewId, setSelectedInterviewId] = useState(0);
  const [showInterviewDetail, setShowInterviewDetail] = useState(false);
  const [hasConfirmedRecordingCompliance, setHasConfirmedRecordingCompliance] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);
  const [microphonePermission, setMicrophonePermission] = useState<{
    status: 'granted' | 'denied' | 'undetermined';
    canAskAgain: boolean;
  }>({ status: 'undetermined', canAskAgain: true });
  const [showNewJob, setShowNewJob] = useState(false);
  const [showNewInterview, setShowNewInterview] = useState(false);
  const [showMockInterview, setShowMockInterview] = useState(false);
  const [showHrDemo, setShowHrDemo] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [interviewDrafts, setInterviewDrafts] = useState<Record<number, InterviewDraft>>({});
  const [jobStatusOverrides, setJobStatusOverrides] = useState<Record<number, ApplicationStatus>>({});
  const [interviewAudioStates, setInterviewAudioStates] = useState<Record<number, InterviewAudioState>>({});
  const [interviewResults, setInterviewResults] = useState<Record<number, InterviewResult>>({});
  const [mockInterviewSessions, setMockInterviewSessions] = useState<MockInterviewSession[]>([]);
  const [jobNotes, setJobNotes] = useState<Record<number, JobNote>>({});
  const [jobEvents, setJobEvents] = useState<Record<number, ApplicationEvent[]>>({});
  const [jobResumeOverrides, setJobResumeOverrides] = useState<Record<number, string>>({});
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>(defaultResumeVersions);
  const [hrAnswerRecords, setHrAnswerRecords] = useState<Record<number, HrAnswerRecord[]>>({});
  const [jobResearchItems, setJobResearchItems] = useState<Record<number, JobResearchItem[]>>({});
  const [archivedJobs, setArchivedJobs] = useState<Record<number, string>>({});
  const [archivedInterviews, setArchivedInterviews] = useState<Record<number, string>>({});
  const [hrAnswerBusyJobId, setHrAnswerBusyJobId] = useState<number | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(defaultUserPreferences);
  const [userInterviewProfile, setUserInterviewProfile] = useState<UserInterviewProfile>(emptyInterviewProfile);
  const [aiServiceSettings, setAiServiceSettings] = useState<AiServiceSettings>(defaultAiServiceSettings);
  const [aiApiKey, setAiApiKey] = useState('');
  const [ocrApiKey, setOcrApiKey] = useState('');
  const [researchApiKey, setResearchApiKey] = useState('');
  const [tencentAsrCredentials, setTencentAsrCredentials] = useState<TencentAsrCredentials>({
    appId: '',
    secretId: '',
    secretKey: '',
  });
  const [aiTasksByInterview, setAiTasksByInterview] = useState<Record<number, 'transcribing' | 'reviewing' | undefined>>({});
  const [transcriptionProgressByInterview, setTranscriptionProgressByInterview] = useState<
    Record<number, { completed: number; total: number } | undefined>
  >({});
  const [preparationAiBusyByInterview, setPreparationAiBusyByInterview] = useState<Record<number, boolean | undefined>>({});
  const [senseVoiceModelState, setSenseVoiceModelState] = useState<{
    status: 'idle' | 'preparing' | 'ready' | 'failed';
    percent: number;
    detail: string;
  }>({ status: 'idle', percent: 0, detail: '模型尚未准备' });
  const [interviewChecklistDone, setInterviewChecklistDone] = useState<Record<number, Record<string, boolean>>>({});
  const [customJobs, setCustomJobs] = useState<Job[]>([]);
  const [customInterviews, setCustomInterviews] = useState<Interview[]>([]);
  const [jobEdits, setJobEdits] = useState<Record<number, Partial<Job>>>({});
  const [interviewEdits, setInterviewEdits] = useState<Record<number, Partial<Interview>>>({});
  const [hiddenJobIds, setHiddenJobIds] = useState<number[]>([]);
  const [hiddenInterviewIds, setHiddenInterviewIds] = useState<number[]>([]);
  const [jobSelectionIds, setJobSelectionIds] = useState<number[]>([]);
  const [interviewSelectionIds, setInterviewSelectionIds] = useState<number[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [interviewSearch, setInterviewSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>('all');
  const [jobPlatformFilter, setJobPlatformFilter] = useState('all');
  const [jobCityFilter, setJobCityFilter] = useState('all');
  const [jobResumeFilter, setJobResumeFilter] = useState('all');
  const [jobDateBasis, setJobDateBasis] = useState<JobDateBasis>('activity');
  const [jobDateRange, setJobDateRange] = useState<DateRangeValue>({ ...defaultDateRange, preset: 'all' });
  const [homeDateRange, setHomeDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [showJobFilters, setShowJobFilters] = useState(false);
  const [showBatchResearch, setShowBatchResearch] = useState(false);
  const [batchResearchSelectedIds, setBatchResearchSelectedIds] = useState<number[]>([]);
  const [batchResearchProgress, setBatchResearchProgress] = useState<BatchResearchProgress>({
    status: 'idle',
    completedJobs: 0,
    totalJobs: 0,
    currentJobId: null,
    detail: '',
  });
  const [interviewListFilter, setInterviewListFilter] = useState<InterviewListFilter>('all');
  const [interviewDateRange, setInterviewDateRange] = useState<DateRangeValue>({ ...defaultDateRange, preset: 'all' });
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [newInterviewJobId, setNewInterviewJobId] = useState<number | null>(null);
  const [nextRoundSourceInterviewId, setNextRoundSourceInterviewId] = useState<number | null>(null);
  const [newCompany, setNewCompany] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newRound, setNewRound] = useState('');
  const [newStartsAt, setNewStartsAt] = useState('');
  const [newType, setNewType] = useState('');
  const [newJobCompany, setNewJobCompany] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobPlatform, setNewJobPlatform] = useState('');
  const [newJobCity, setNewJobCity] = useState('');
  const [newJobSalary, setNewJobSalary] = useState('');
  const [newJobTags, setNewJobTags] = useState('');
  const [newJobResume, setNewJobResume] = useState('');
  const [allowDuplicateJobSave, setAllowDuplicateJobSave] = useState(false);
  const [pendingScreenshotName, setPendingScreenshotName] = useState('');
  const [pendingScreenshotNote, setPendingScreenshotNote] = useState<Partial<JobNote>>({});
  const [pendingJobStatus, setPendingJobStatus] = useState<ApplicationStatus | null>(null);
  const [screenshotDrafts, setScreenshotDrafts] = useState<ScreenshotImportDraft[]>([]);
  const [selectedScreenshotDraftIds, setSelectedScreenshotDraftIds] = useState<number[]>([]);
  const [showScreenshotDrafts, setShowScreenshotDrafts] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ completed: number; total: number } | null>(null);
  const [ocrError, setOcrError] = useState('');
  const [showNewResume, setShowNewResume] = useState(false);
  const [newResumeName, setNewResumeName] = useState('');
  const [newResumeTarget, setNewResumeTarget] = useState('');
  const [newResumeKeywords, setNewResumeKeywords] = useState('');
  const [newResumeFileName, setNewResumeFileName] = useState('');
  const [newResumeContent, setNewResumeContent] = useState('');
  const [editingResumeId, setEditingResumeId] = useState<number | null>(null);
  const [endingJob, setEndingJob] = useState<Job | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const selectedInterviewIdRef = useRef(selectedInterviewId);
  selectedInterviewIdRef.current = selectedInterviewId;
  const aiTaskKindsRef = useRef(new Map<number, 'transcribing' | 'reviewing'>());
  const preparationAiBusyIdsRef = useRef(new Set<number>());
  const reviewAbortControllersRef = useRef(new Map<number, AbortController>());
  const researchAbortControllerRef = useRef<AbortController | null>(null);

  const currentDraft: InterviewDraft = {
    ...emptyDraft,
    ...(interviewDrafts[selectedInterviewId] ?? {}),
  };
  const audioPlayer = useAudioPlayer(
    currentDraft.savedAudioUri ? { uri: currentDraft.savedAudioUri } : null,
    { updateInterval: 250 },
  );
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const playbackStatus = Platform.OS === 'android'
    ? selectAudioPlaybackSnapshot(currentDraft.savedAudioUri, nativePlaybackStatus, {
        isLoaded: Boolean(currentDraft.savedAudioUri),
        playing: false,
        currentTime: 0,
        duration: currentDraft.audioDurationMillis / 1000,
        isBuffering: false,
      })
    : audioStatus;

  useEffect(() => {
    audioPlayer.pause();
    if (Platform.OS === 'android') void pauseNativeAudioPlayback().catch(() => undefined);
    if (currentDraft.savedAudioUri) {
      audioPlayer.replace({ uri: currentDraft.savedAudioUri });
    }
    setNativePlaybackStatus(null);
    setPlaybackTargetSeconds(null);
    setPlaybackRequestState('idle');
  }, [audioPlayer, selectedInterviewId, currentDraft.savedAudioUri]);

  useEffect(() => {
    const sourceUri = currentDraft.savedAudioUri;
    if (
      Platform.OS !== 'android'
      || !sourceUri
      || nativePlaybackStatus?.sourceUri !== sourceUri
      || !nativePlaybackStatus.isLoaded
    ) return;
    const timer = setInterval(() => {
      getNativeAudioPlaybackStatus()
        .then((status) => {
          if (status) setNativePlaybackStatus(bindAudioPlaybackSnapshot(sourceUri, status));
        })
        .catch(() => undefined);
    }, 250);
    return () => clearInterval(timer);
  }, [currentDraft.savedAudioUri, nativePlaybackStatus?.isLoaded, nativePlaybackStatus?.sourceUri]);

  useEffect(() => {
    void configureLocalNotifications();
    return subscribeToInterviewNotificationResponses((interviewId) => {
      setSelectedInterviewId(interviewId);
      setInterviewDetailSection('prepare');
      setShowInterviewDetail(true);
      setActiveTab('interviews');
    });
  }, []);

  useEffect(() => {
    const refreshClock = () => setClockTick(Date.now());
    const timer = setInterval(refreshClock, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshClock();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ y: 0, animated: false }));
  }, [activeTab, homeSection, selectedJobId, selectedInterviewId, showInterviewDetail, jobDetailSection, interviewDetailSection, meSection]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (jobSelectionIds.length) {
        setJobSelectionIds([]);
        return true;
      }
      if (interviewSelectionIds.length) {
        setInterviewSelectionIds([]);
        return true;
      }
      if (activeTab === 'jobs' && selectedJobId !== null) {
        if (isEditingJob) setIsEditingJob(false);
        else setSelectedJobId(null);
        return true;
      }
      if (activeTab === 'interviews' && showInterviewDetail) {
        setShowInterviewDetail(false);
        return true;
      }
      if (activeTab === 'me' && meSection !== 'main') {
        setMeSection('main');
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, interviewSelectionIds.length, isEditingJob, jobSelectionIds.length, meSection, selectedJobId, showInterviewDetail]);

  useEffect(() => {
    setIsEditingJob(false);
  }, [selectedJobId]);

  const jobs = useMemo<Job[]>(
    () =>
      customJobs
        .filter((job) => !hiddenJobIds.includes(job.id))
        .map((job) => ({
          ...job,
          ...(jobEdits[job.id] ?? {}),
          status: jobStatusOverrides[job.id] ?? job.status,
          resume: jobResumeOverrides[job.id] ?? job.resume,
        })),
    [customJobs, hiddenJobIds, jobEdits, jobResumeOverrides, jobStatusOverrides],
  );
  const interviews = useMemo<Interview[]>(
    () =>
      customInterviews
        .filter((interview) => !hiddenInterviewIds.includes(interview.id))
        .map((interview) => ({
          ...interview,
          ...(interviewEdits[interview.id] ?? {}),
          audioState: interviewAudioStates[interview.id] ?? interview.audioState,
        })),
    [customInterviews, hiddenInterviewIds, interviewAudioStates, interviewEdits],
  );
  const activeJobs = useMemo(
    () => jobs.filter((job) => !archivedJobs[job.id]),
    [archivedJobs, jobs],
  );
  const activeJobIds = useMemo(() => new Set(activeJobs.map((job) => job.id)), [activeJobs]);
  const activeInterviews = useMemo(
    () => interviews.filter((interview) => activeJobIds.has(interview.jobId) && !archivedInterviews[interview.id]),
    [activeJobIds, archivedInterviews, interviews],
  );
  const selectedInterview =
    interviews.find((interview) => interview.id === selectedInterviewId) ?? activeInterviews[0] ?? interviews[0];
  const upcomingInterviews = useMemo(() => {
    const now = clockTick;
    const matched = activeInterviews
      .filter((interview) => interview.status === '待面试')
      .filter((interview) => {
        const scheduledAt = resolveInterviewDateTime(interview.startsAt, interview.id)?.getTime();
        return scheduledAt === undefined || scheduledAt >= now - 3 * 60 * 60 * 1000;
      })
      .sort((left, right) => {
        const leftTime = resolveInterviewDateTime(left.startsAt, left.id)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightTime = resolveInterviewDateTime(right.startsAt, right.id)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      });
    return matched;
  }, [activeInterviews, clockTick]);
  const homeJobs = useMemo(() => activeJobs.filter((job) => isDateInRange(getJobDate({
    job,
    note: jobNotes[job.id],
    events: jobEvents[job.id],
    interviews: activeInterviews.filter((interview) => interview.jobId === job.id),
    interviewDrafts,
    hrAnswers: hrAnswerRecords[job.id],
  }, 'applied'), homeDateRange)), [activeInterviews, activeJobs, homeDateRange, hrAnswerRecords, interviewDrafts, jobEvents, jobNotes]);
  const homeJobIds = useMemo(() => new Set(homeJobs.map((job) => job.id)), [homeJobs]);
  const homeInterviews = useMemo(
    () => activeInterviews.filter((interview) => homeJobIds.has(interview.jobId)),
    [activeInterviews, homeJobIds],
  );
  const metrics = useMemo(() => calculateMetrics(homeJobs, homeInterviews), [homeInterviews, homeJobs]);
  const filteredJobs = useMemo(
    () => filterJobs(
      activeJobs,
      jobSearch,
      jobStatusFilter,
      jobPlatformFilter,
      jobCityFilter,
      jobResumeFilter,
    ).filter((job) => isDateInRange(getJobDate({
      job,
      note: jobNotes[job.id],
      events: jobEvents[job.id],
      interviews: activeInterviews.filter((interview) => interview.jobId === job.id),
      interviewDrafts,
      hrAnswers: hrAnswerRecords[job.id],
    }, jobDateBasis), jobDateRange)),
    [activeInterviews, activeJobs, hrAnswerRecords, interviewDrafts, jobDateBasis, jobDateRange, jobEvents, jobNotes, jobSearch, jobStatusFilter, jobPlatformFilter, jobCityFilter, jobResumeFilter],
  );
  const filteredInterviews = useMemo(
    () => filterInterviews(activeInterviews, interviewSearch, interviewListFilter)
      .filter((interview) => isDateInRange(resolveInterviewDateTime(interview.startsAt, interview.id), interviewDateRange)),
    [activeInterviews, interviewDateRange, interviewListFilter, interviewSearch],
  );
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedJobNote: JobNote = selectedJob
    ? { ...emptyJobNote, ...(jobNotes[selectedJob.id] ?? {}) }
    : emptyJobNote;
  const durationText = formatDuration(Math.floor(recordingDurationMillis / 1000));

  useEffect(() => {
    let mounted = true;
    setSavedAudioFileSizeBytes(0);
    if (!currentDraft.savedAudioUri) return () => { mounted = false; };
    getAudioFileSize(currentDraft.savedAudioUri)
      .then((sizeBytes) => {
        if (mounted) setSavedAudioFileSizeBytes(sizeBytes);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [currentDraft.savedAudioUri]);

  useEffect(() => {
    const sourceUri = currentDraft.savedAudioUri;
    const interviewId = selectedInterviewId;
    if (!isHydrated || !sourceUri || currentDraft.audioDurationMillis > 0) return;
    getAudioDurationMillis(sourceUri).then((durationMillis) => {
      if (!durationMillis) return;
      setInterviewDrafts((current) => {
        const draft = current[interviewId];
        if (!draft || draft.savedAudioUri !== sourceUri) return current;
        return {
          ...current,
          [interviewId]: {
            ...draft,
            audioDurationMillis: durationMillis,
          },
        };
      });
    }).catch(() => undefined);
  }, [currentDraft.audioDurationMillis, currentDraft.savedAudioUri, isHydrated, selectedInterviewId]);

  useEffect(() => {
    if (!isRecording || isRecordingPaused) {
      return;
    }
    setRecordingDurationMillis(audioRecorderState.durationMillis);
    const metering = audioRecorderState.metering;
    if (typeof metering !== 'number') {
      return;
    }
    if (metering > -55) {
      lastAudibleAtRef.current = Date.now();
      setRecordingHealth('healthy');
      return;
    }
    if (Date.now() - lastAudibleAtRef.current >= 20_000) {
      setRecordingHealth('quiet');
    }
  }, [audioRecorderState.durationMillis, audioRecorderState.metering, isRecording, isRecordingPaused]);

  useEffect(() => {
    if (isRecording && audioRecorder.uri) {
      updateActiveRecordingSource(audioRecorder.uri).catch(() => undefined);
    }
  }, [audioRecorder.uri, isRecording]);

  useEffect(() => {
    if (!importNotice) return;
    const timer = setTimeout(() => setImportNotice(''), 4_000);
    return () => clearTimeout(timer);
  }, [importNotice]);

  useEffect(() => {
    if (!isRecording || isRecordingPaused || !audioRecorder.uri) return;
    let mounted = true;
    const inspectWrite = async () => {
      try {
        const sizeBytes = await getAudioFileSize(audioRecorder.uri);
        if (!mounted) return;
        setRecordingFileSizeBytes(sizeBytes);
        if (sizeBytes > recordingLastSizeRef.current) {
          recordingLastSizeRef.current = sizeBytes;
          recordingLastGrowthAtRef.current = Date.now();
          setRecordingWriteState('writing');
        } else if (Date.now() - recordingLastGrowthAtRef.current > 20_000) {
          setRecordingWriteState('waiting');
        }
      } catch {
        if (mounted && Date.now() - recordingLastGrowthAtRef.current > 20_000) {
          setRecordingWriteState('waiting');
        }
      }
    };
    void inspectWrite();
    const timer = setInterval(inspectWrite, 5_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [audioRecorder.uri, isRecording, isRecordingPaused]);

  function applyPersistedState(state: PersistedAppState) {
    setSelectedInterviewId(state.selectedInterviewId);
    setHasConfirmedRecordingCompliance(state.hasConfirmedRecordingCompliance);
    setInterviewDrafts(state.interviewDrafts);
    setJobStatusOverrides(state.jobStatusOverrides);
    setInterviewAudioStates(state.interviewAudioStates);
    setInterviewResults(state.interviewResults);
    setJobNotes(state.jobNotes);
    setJobEvents(state.jobEvents);
    setJobResumeOverrides(state.jobResumeOverrides);
    setResumeVersions(state.resumeVersions);
    setHrAnswerRecords(state.hrAnswerRecords);
    setJobResearchItems(state.jobResearchItems);
    setArchivedJobs(state.archivedJobs);
    setArchivedInterviews(state.archivedInterviews);
    setUserPreferences(state.userPreferences);
    setUserInterviewProfile(state.userInterviewProfile);
    setAiServiceSettings(state.aiServiceSettings);
    setInterviewChecklistDone(state.interviewChecklistDone);
    setCustomJobs(state.customJobs);
    setCustomInterviews(state.customInterviews);
    setJobEdits(state.jobEdits);
    setInterviewEdits(state.interviewEdits);
    setHiddenJobIds(state.hiddenJobIds);
    setHiddenInterviewIds(state.hiddenInterviewIds);
    setMockInterviewSessions(state.mockInterviewSessions);
  }

  function getPersistedState(): PersistedAppState {
    return {
      selectedInterviewId,
      hasConfirmedRecordingCompliance,
      userPreferences,
      userInterviewProfile,
      aiServiceSettings,
      customJobs,
      customInterviews,
      jobEdits,
      interviewEdits,
      hiddenJobIds,
      hiddenInterviewIds,
      resumeVersions,
      hrAnswerRecords,
      jobResearchItems,
      archivedJobs,
      archivedInterviews,
      jobResumeOverrides,
      jobNotes,
      jobEvents,
      interviewChecklistDone,
      interviewDrafts,
      savedAudioUri: currentDraft.savedAudioUri,
      savedAudioName: currentDraft.savedAudioName,
      audioWorkState: currentDraft.audioWorkState,
      transcript: currentDraft.transcript,
      note: currentDraft.note,
      jobStatusOverrides,
      interviewAudioStates,
      interviewResults,
      mockInterviewSessions,
    };
  }

  useEffect(() => {
    let mounted = true;
    loadPersistedAppState()
      .then((state) => {
        if (!mounted || !state) {
          return;
        }
        applyPersistedState(state);
      })
      .finally(() => {
        if (mounted) {
          setIsHydrated(true);
        }
      });
    loadAiApiKey()
      .then((value) => {
        if (mounted && value) {
          setAiApiKey(value);
        }
      })
      .catch(() => undefined);
    loadOcrApiKey()
      .then((value) => {
        if (mounted && value) setOcrApiKey(value);
      })
      .catch(() => undefined);
    loadResearchApiKey()
      .then((value) => {
        if (mounted && value) setResearchApiKey(value);
      })
      .catch(() => undefined);
    loadTencentAsrCredentials()
      .then((value) => {
        if (mounted && value) {
          setTencentAsrCredentials(value);
        }
      })
      .catch(() => undefined);
    consumeInterruptedLongTask()
      .then((task) => {
        if (!mounted || !task) return;
        setImportNotice(task.type === 'ocr'
          ? '上次截图识别在应用退出时中断，请重新导入截图。'
          : '上次批量调研在应用退出时中断，已完成的结果仍会保留。');
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const syncMicrophonePermission = () => {
      getRecordingPermissionsAsync()
        .then((permission) => {
          setMicrophonePermission({ status: permission.status, canAskAgain: permission.canAskAgain });
        })
        .catch(() => undefined);
    };

    syncMicrophonePermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncMicrophonePermission();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isHydrated || recoveryCheckedRef.current) return;
    recoveryCheckedRef.current = true;
    recoverActiveRecording()
      .then((result) => {
        if (!result) return;
        if (!result.recovered) {
          clearActiveRecordingMarker().catch(() => undefined);
          Alert.alert('发现中断的录音任务', '应用上次在录音过程中退出，但没有找到可恢复的音频文件。');
          return;
        }
        const { marker, recovered } = result;
        setInterviewDrafts((current) => ({
          ...current,
          [marker.interviewId]: {
            ...(current[marker.interviewId] ?? emptyDraft),
            ...createFreshAudioAnalysisPatch(),
            savedAudioUri: recovered.uri,
            savedAudioName: marker.fileName,
            audioDurationMillis: 0,
            audioMimeType: 'audio/mp4',
            recordingHealth: 'unknown',
          },
        }));
        setInterviewAudioStates((current) => ({ ...current, [marker.interviewId]: '已录音' }));
        Alert.alert('已恢复录音', '上次异常退出前的录音已保存到本机，可先播放确认内容。');
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : '未知错误';
        Alert.alert('录音恢复失败', `${detail}\n\n恢复标记仍然保留，下次打开应用会再次尝试。`);
      });
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || aiServiceSettings.transcriptionProvider !== 'local-sensevoice') {
      return;
    }
    let mounted = true;
    setSenseVoiceModelState({ status: 'preparing', percent: 0, detail: '正在检查模型' });
    getSenseVoiceModelStatus()
      .then((model) => {
        if (!mounted) return;
        setSenseVoiceModelState(
          model.ready
            ? { status: 'ready', percent: 100, detail: '模型已就绪，可离线转写' }
            : { status: 'idle', percent: 0, detail: '模型尚未准备' },
        );
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        const detail = error instanceof Error ? error.message : '模型检查失败';
        setSenseVoiceModelState({ status: 'failed', percent: 0, detail });
      });
    return () => {
      mounted = false;
    };
  }, [aiServiceSettings.transcriptionProvider, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    savePersistedAppState(getPersistedState()).catch(() => {
      Alert.alert('本地保存失败', '当前修改没有成功写入本地存储。');
    });
  }, [
    customInterviews,
    customJobs,
    aiServiceSettings,
    hiddenInterviewIds,
    hiddenJobIds,
    hasConfirmedRecordingCompliance,
    interviewEdits,
    interviewAudioStates,
    interviewChecklistDone,
    interviewDrafts,
    interviewResults,
    mockInterviewSessions,
    isHydrated,
    jobEvents,
    jobEdits,
    jobNotes,
    jobResumeOverrides,
    jobStatusOverrides,
    resumeVersions,
    hrAnswerRecords,
    jobResearchItems,
    archivedJobs,
    archivedInterviews,
    selectedInterviewId,
    userInterviewProfile,
    userPreferences,
  ]);

  function updateCurrentDraft(patch: Partial<InterviewDraft>) {
    updateInterviewDraft(selectedInterviewId, patch);
  }

  function updateInterviewDraft(interviewId: number, patch: Partial<InterviewDraft>) {
    setInterviewDrafts((current) => ({
      ...current,
      [interviewId]: {
        ...(current[interviewId] ?? emptyDraft),
        ...patch,
      },
    }));
  }

  function updateInterviewAudioState(nextState: AudioWorkState) {
    updateInterviewAudioStateFor(selectedInterviewId, nextState);
  }

  function updateInterviewAudioStateFor(interviewId: number, nextState: AudioWorkState) {
    updateInterviewDraft(interviewId, { audioWorkState: nextState });
    setInterviewAudioStates((current) => ({
      ...current,
      [interviewId]: getAudioStateFromWorkState(nextState),
    }));
  }

  function setInterviewAiTask(interviewId: number, task: 'transcribing' | 'reviewing' | null) {
    if (task) aiTaskKindsRef.current.set(interviewId, task);
    else aiTaskKindsRef.current.delete(interviewId);
    setAiTasksByInterview((current) => ({ ...current, [interviewId]: task ?? undefined }));
  }

  function setInterviewTranscriptionProgress(
    interviewId: number,
    progress: { completed: number; total: number } | null,
  ) {
    setTranscriptionProgressByInterview((current) => ({
      ...current,
      [interviewId]: progress ?? undefined,
    }));
  }

  function cycleJobStatus(jobId: number, currentStatus: ApplicationStatus) {
    if (currentStatus === 'ended') return;
    const nextStatus = getNextApplicationStatus(currentStatus);
    const job = jobs.find((item) => item.id === jobId);
    if (nextStatus === 'ended' && job) {
      setEndingJob(job);
      return;
    }

    applyJobStatus(jobId, currentStatus, nextStatus, '状态推进');
  }

  function applyJobStatus(
    jobId: number,
    fromStatus: ApplicationStatus,
    toStatus: ApplicationStatus,
    note: string,
  ) {
    setJobStatusOverrides((current) => ({
      ...current,
      [jobId]: toStatus,
    }));
    setJobEvents((current) => ({
      ...current,
      [jobId]: [
        {
          id: Date.now(),
          jobId,
          fromStatus,
          toStatus,
          eventTime: new Date().toISOString(),
          note,
        },
        ...(current[jobId] ?? []),
      ],
    }));
  }

  function confirmEndJob(reason: EndReason) {
    if (!endingJob) {
      return;
    }
    updateJobNote(endingJob.id, { endReason: reason });
    applyJobStatus(endingJob.id, endingJob.status, 'ended', `结束原因：${reason}`);
    setEndingJob(null);
  }

  function deleteJob(job: Job) {
    const linkedInterviews = interviews.filter((item) => item.jobId === job.id);
    Alert.alert('永久删除职位', `将同时删除「${job.company} · ${job.title}」的时间线、备注、关联面试、录音、转写和复盘。此操作无法恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => { void (async () => {
          const interviewIds = linkedInterviews.map((item) => item.id);
          const audioUris = [
            ...interviewIds.map((id) => interviewDrafts[id]?.savedAudioUri),
            ...mockInterviewSessions.filter((session) => session.jobId === job.id).flatMap((session) => session.turns.map((turn) => turn.audioUri)),
          ].filter((uri): uri is string => Boolean(uri));
          await Promise.all(audioUris.map((uri) => deleteAudioFile(uri)));

          setCustomJobs((current) => current.filter((item) => item.id !== job.id));
          setCustomInterviews((current) => current.filter((item) => item.jobId !== job.id));
          setHiddenJobIds((current) => Array.from(new Set([...current, job.id])));
          setHiddenInterviewIds((current) => Array.from(new Set([...current, ...interviewIds])));
          setJobStatusOverrides((current) => omitRecordKeys(current, [job.id]));
          setJobEdits((current) => omitRecordKeys(current, [job.id]));
          setJobNotes((current) => omitRecordKeys(current, [job.id]));
          setJobEvents((current) => omitRecordKeys(current, [job.id]));
          setJobResearchItems((current) => omitRecordKeys(current, [job.id]));
          setArchivedJobs((current) => omitRecordKeys(current, [job.id]));
          setJobResumeOverrides((current) => omitRecordKeys(current, [job.id]));
          setInterviewEdits((current) => omitRecordKeys(current, interviewIds));
          setInterviewDrafts((current) => omitRecordKeys(current, interviewIds));
          setInterviewResults((current) => omitRecordKeys(current, interviewIds));
          setInterviewAudioStates((current) => omitRecordKeys(current, interviewIds));
          setInterviewChecklistDone((current) => omitRecordKeys(current, interviewIds));
          setMockInterviewSessions((current) => current.filter((session) => session.jobId !== job.id));
          setSelectedJobId(null);
          setShowInterviewDetail(false);
          const nextInterview = interviews.find((item) => item.jobId !== job.id);
          if (nextInterview) setSelectedInterviewId(nextInterview.id);
        })().catch((error: unknown) => {
          Alert.alert('删除失败', error instanceof Error ? error.message : '本地数据没有完整删除。');
        }); },
      },
    ]);
  }

  function deleteInterview(interview: Interview) {
    Alert.alert('永久删除面试', `将删除「${interview.company} · ${interview.round}」的录音、转写、复盘和准备材料。此操作无法恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => { void (async () => {
          await deleteAudioFile(interviewDrafts[interview.id]?.savedAudioUri ?? null);
          setCustomInterviews((current) => current.filter((item) => item.id !== interview.id));
          setHiddenInterviewIds((current) => Array.from(new Set([...current, interview.id])));
          setInterviewEdits((current) => omitRecordKeys(current, [interview.id]));
          setInterviewDrafts((current) => omitRecordKeys(current, [interview.id]));
          setInterviewResults((current) => omitRecordKeys(current, [interview.id]));
          setInterviewAudioStates((current) => omitRecordKeys(current, [interview.id]));
          setInterviewChecklistDone((current) => omitRecordKeys(current, [interview.id]));
          const nextInterview = interviews.find((item) => item.id !== interview.id);
          if (nextInterview) {
            setSelectedInterviewId(nextInterview.id);
          }
          setShowInterviewDetail(false);
        })().catch((error: unknown) => {
          Alert.alert('删除失败', error instanceof Error ? error.message : '本地数据没有完整删除。');
        }); },
      },
    ]);
  }

  function archiveSelectedJobs(jobIds: number[]) {
    if (!jobIds.length) return;
    const archivedAt = new Date().toISOString();
    setArchivedJobs((current) => ({
      ...current,
      ...Object.fromEntries(jobIds.map((jobId) => [jobId, archivedAt])),
    }));
    setJobSelectionIds([]);
    setSelectedJobId(null);
    setImportNotice(`已归档 ${jobIds.length} 个职位，关联面试和录音仍保留`);
  }

  function archiveSelectedInterviews(interviewIds: number[]) {
    if (!interviewIds.length) return;
    const archivedAt = new Date().toISOString();
    setArchivedInterviews((current) => ({
      ...current,
      ...Object.fromEntries(interviewIds.map((interviewId) => [interviewId, archivedAt])),
    }));
    setInterviewSelectionIds([]);
    setShowInterviewDetail(false);
    const nextInterview = activeInterviews.find((interview) => !interviewIds.includes(interview.id));
    if (nextInterview) setSelectedInterviewId(nextInterview.id);
    setImportNotice(`已归档 ${interviewIds.length} 场面试，录音和复盘仍保留`);
  }

  function deleteSelectedJobs(jobIds: number[]) {
    if (!jobIds.length) return;
    const linkedInterviewIds = interviews.filter((item) => jobIds.includes(item.jobId)).map((item) => item.id);
    Alert.alert(
      `删除 ${jobIds.length} 个职位`,
      `将同时删除 ${linkedInterviewIds.length} 场关联面试的录音、转写和复盘。此操作无法恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久删除',
          style: 'destructive',
          onPress: () => { void (async () => {
            const audioUris = linkedInterviewIds
              .map((id) => interviewDrafts[id]?.savedAudioUri)
              .filter((uri): uri is string => Boolean(uri));
            await Promise.all(audioUris.map((uri) => deleteAudioFile(uri)));
            setCustomJobs((current) => current.filter((item) => !jobIds.includes(item.id)));
            setCustomInterviews((current) => current.filter((item) => !jobIds.includes(item.jobId)));
            setHiddenJobIds((current) => Array.from(new Set([...current, ...jobIds])));
            setHiddenInterviewIds((current) => Array.from(new Set([...current, ...linkedInterviewIds])));
            setJobStatusOverrides((current) => omitRecordKeys(current, jobIds));
            setJobEdits((current) => omitRecordKeys(current, jobIds));
            setJobNotes((current) => omitRecordKeys(current, jobIds));
            setJobEvents((current) => omitRecordKeys(current, jobIds));
            setJobResearchItems((current) => omitRecordKeys(current, jobIds));
            setArchivedJobs((current) => omitRecordKeys(current, jobIds));
            setJobResumeOverrides((current) => omitRecordKeys(current, jobIds));
            setInterviewEdits((current) => omitRecordKeys(current, linkedInterviewIds));
            setInterviewDrafts((current) => omitRecordKeys(current, linkedInterviewIds));
            setInterviewResults((current) => omitRecordKeys(current, linkedInterviewIds));
            setInterviewAudioStates((current) => omitRecordKeys(current, linkedInterviewIds));
            setInterviewChecklistDone((current) => omitRecordKeys(current, linkedInterviewIds));
            setMockInterviewSessions((current) => current.filter((session) => !session.jobId || !jobIds.includes(session.jobId)));
            setJobSelectionIds([]);
          })().catch((error: unknown) => Alert.alert('删除失败', error instanceof Error ? error.message : '本地数据未完整删除。')); },
        },
      ],
    );
  }

  function deleteSelectedInterviews(interviewIds: number[]) {
    if (!interviewIds.length) return;
    Alert.alert(`删除 ${interviewIds.length} 场面试`, '将删除选中面试的录音、转写、复盘和准备材料。此操作无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => { void (async () => {
          await Promise.all(interviewIds.map((id) => deleteAudioFile(interviewDrafts[id]?.savedAudioUri ?? null)));
          setCustomInterviews((current) => current.filter((item) => !interviewIds.includes(item.id)));
          setHiddenInterviewIds((current) => Array.from(new Set([...current, ...interviewIds])));
          setInterviewEdits((current) => omitRecordKeys(current, interviewIds));
          setInterviewDrafts((current) => omitRecordKeys(current, interviewIds));
          setInterviewResults((current) => omitRecordKeys(current, interviewIds));
          setInterviewAudioStates((current) => omitRecordKeys(current, interviewIds));
          setInterviewChecklistDone((current) => omitRecordKeys(current, interviewIds));
          setArchivedInterviews((current) => omitRecordKeys(current, interviewIds));
          setInterviewSelectionIds([]);
          setShowInterviewDetail(false);
        })().catch((error: unknown) => Alert.alert('删除失败', error instanceof Error ? error.message : '本地数据未完整删除。')); },
      },
    ]);
  }

  function setCurrentInterviewResult(result: InterviewResult) {
    setInterviewResults((current) => ({
      ...current,
      [selectedInterviewId]: result,
    }));
    if ((result === '通过' || result === '进入下一轮') && selectedInterview) {
      const linkedJob = jobs.find((job) => job.id === selectedInterview.jobId);
      if (linkedJob && statusOrder.indexOf(linkedJob.status) < statusOrder.indexOf('interviewing')) {
        applyJobStatus(linkedJob.id, linkedJob.status, 'interviewing', `面试结果：${result}`);
      }
    }
    if (result === '未通过' && selectedInterview) {
      const linkedJob = jobs.find((job) => job.id === selectedInterview.jobId);
      if (linkedJob && linkedJob.status !== 'ended') {
        setEndingJob(linkedJob);
      }
    }
    if (result === '进入下一轮' && selectedInterview) {
      openNextRoundInterview(selectedInterview);
    }
  }

  function updateJobNote(jobId: number, patch: Partial<JobNote>) {
    setJobNotes((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] ?? emptyJobNote),
        ...patch,
      },
    }));
  }

  function updateJobEdit(jobId: number, patch: Partial<Job>) {
    const normalizedPatch = patch.city === undefined ? patch : { ...patch, city: normalizeCityLabel(patch.city) };
    setJobEdits((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] ?? {}),
        ...normalizedPatch,
      },
    }));
  }

  function updateInterviewEdit(interviewId: number, patch: Partial<Interview>) {
    setInterviewEdits((current) => ({
      ...current,
      [interviewId]: {
        ...(current[interviewId] ?? {}),
        ...patch,
      },
    }));
  }

  function toggleChecklistItem(interviewId: number, item: string) {
    setInterviewChecklistDone((current) => ({
      ...current,
      [interviewId]: {
        ...(current[interviewId] ?? {}),
        [item]: !current[interviewId]?.[item],
      },
    }));
  }

  function openInterviewFormForJob(job: Job) {
    setNextRoundSourceInterviewId(null);
    setNewInterviewJobId(job.id);
    setNewCompany(job.company);
    setNewTitle(job.title);
    setNewRound('');
    setNewStartsAt('');
    setNewType('');
    setActiveTab('interviews');
    setShowNewInterview(true);
  }

  function openNextRoundInterview(source: Interview) {
    setNextRoundSourceInterviewId(source.id);
    setNewInterviewJobId(source.jobId);
    setNewCompany(source.company);
    setNewTitle(source.title);
    setNewRound(inferNextInterviewRound(source.round));
    setNewStartsAt('');
    setNewType(source.type);
    setShowNewInterview(true);
  }

  function createInterview() {
    const linkedJob = jobs.find((job) => job.id === newInterviewJobId);
    const linkedJobNote = linkedJob ? jobNotes[linkedJob.id] : null;
    const sourceInterview = nextRoundSourceInterviewId
      ? interviews.find((interview) => interview.id === nextRoundSourceInterviewId)
      : null;
    const sourceDraft = sourceInterview ? interviewDrafts[sourceInterview.id] : null;
    const company = newCompany.trim() || linkedJob?.company || '';
    const title = newTitle.trim() || linkedJob?.title || '';
    const round = newRound.trim() || '技术面';
    const startsAt = normalizeInterviewDateTime(newStartsAt) || '待定';
    const type = newType.trim() || '视频';

    if (!company || !title) {
      Alert.alert('信息不完整', '公司和岗位是必填项。');
      return;
    }

    const id = Date.now();
    const resolvedJob = linkedJob ?? buildInterviewLinkedJob({
      id,
      company,
      title,
      resume: resumeVersions[0]?.name ?? '未绑定',
    });
    const created: Interview = {
      id,
      jobId: resolvedJob.id,
      company,
      title,
      round,
      type,
      startsAt,
      status: '待面试',
      audioState: '未录音',
      jdSummary: linkedJobNote?.jdSummary || sourceInterview?.jdSummary || '',
      checklist: sourceInterview?.checklist.length
        ? sourceInterview.checklist
        : ['确认面试形式和时间', '准备项目介绍', '记录面试后反馈'],
    };

    if (!linkedJob) {
      setCustomJobs((current) => [resolvedJob, ...current]);
      setJobEvents((current) => ({
        ...current,
        [resolvedJob.id]: [{
          id: resolvedJob.id + 1,
          jobId: resolvedJob.id,
          fromStatus: null,
          toStatus: 'interviewing',
          eventTime: new Date().toISOString(),
          note: '由手动创建面试同步生成',
        }],
      }));
      setImportNotice('已同步创建关联职位');
    }
    setCustomInterviews((current) => [created, ...current]);
    if (linkedJob && statusOrder.indexOf(linkedJob.status) < statusOrder.indexOf('interviewing')) {
      applyJobStatus(linkedJob.id, linkedJob.status, 'interviewing', '已创建关联面试');
    }
    if (sourceDraft || linkedJobNote?.nextAction || linkedJobNote?.note) {
      setInterviewDrafts((current) => ({
        ...current,
        [id]: {
          ...emptyDraft,
          selfIntroduction: sourceDraft?.selfIntroduction ?? '',
          projectStories: sourceDraft?.projectStories ?? '',
          companyResearch: sourceDraft?.companyResearch ?? '',
          roleUnderstanding: sourceDraft?.roleUnderstanding ?? '',
          questionsForInterviewer: sourceDraft?.questionsForInterviewer ?? '',
          preparationMaterials: (sourceDraft?.preparationMaterials ?? []).map((material, index) => ({
            ...material,
            id: `next-round-${id}-${index}`,
          })),
          note: [linkedJobNote?.nextAction, linkedJobNote?.note].filter(Boolean).join('\n'),
        },
      }));
    }
    setSelectedInterviewId(created.id);
    setActiveTab('interviews');
    setShowInterviewDetail(true);
    setInterviewDetailSection('prepare');
    setShowNewInterview(false);
    setNewInterviewJobId(null);
    setNextRoundSourceInterviewId(null);
    setNewCompany('');
    setNewTitle('');
    setNewRound('');
    setNewStartsAt('');
    setNewType('');
  }

  function createJob() {
    const company = newJobCompany.trim();
    const title = newJobTitle.trim();
    if (!company || !title) {
      Alert.alert('信息不完整', '公司和岗位是必填项。');
      return;
    }

    const platform = newJobPlatform.trim() || '其他';
    const duplicated = jobs.find(
      (job) =>
        normalizeText(job.company) === normalizeText(company) &&
        normalizeText(job.platform) === normalizeText(platform) &&
        isSimilarTitle(job.title, title),
    );
    if (duplicated && !allowDuplicateJobSave) {
      Alert.alert('可能重复职位', `已存在「${duplicated.company} · ${duplicated.title}」，请确认是新职位还是重复录入。`, [
        { text: '返回修改', style: 'cancel' },
        {
          text: '仍然保存',
          onPress: () => {
            setAllowDuplicateJobSave(true);
          },
        },
      ]);
      return;
    }

    const id = Date.now();
    const created: Job = {
      id,
      company,
      title,
      platform,
      city: normalizeCityLabel(newJobCity.trim() || '待定'),
      status: pendingJobStatus ?? 'interested',
      salary: newJobSalary.trim() || '未填写',
      tags: splitTags(newJobTags),
      resume: newJobResume || resumeVersions[0]?.name || '未绑定',
    };

    setCustomJobs((current) => [created, ...current]);
    if (pendingJobStatus) {
      setJobEvents((current) => ({
        ...current,
        [id]: [
          {
            id: id + 1,
            jobId: id,
            fromStatus: null,
            toStatus: pendingJobStatus,
            eventTime: new Date().toISOString(),
            note: pendingScreenshotName ? '由招聘截图导入的初始状态' : '新建职位初始状态',
          },
        ],
      }));
    }
    if (pendingScreenshotName) {
      setJobNotes((current) => ({
        ...current,
        [id]: {
          ...(current[id] ?? emptyJobNote),
          ...pendingScreenshotNote,
          screenshotName: pendingScreenshotName,
          sourceConfidence: pendingScreenshotNote.sourceConfidence ?? '中',
          note:
            pendingScreenshotNote.note ??
            '由招聘截图生成的可编辑识别结果，字段已由用户确认后保存。',
        },
      }));
    }
    setSelectedJobId(created.id);
    setActiveTab('jobs');
    setShowNewJob(false);
    setNewJobCompany('');
    setNewJobTitle('');
    setNewJobPlatform('');
    setNewJobCity('');
    setNewJobSalary('');
    setNewJobTags('');
    setNewJobResume(resumeVersions[0]?.name ?? '');
    setAllowDuplicateJobSave(false);
    setPendingScreenshotName('');
    setPendingScreenshotNote({});
    setPendingJobStatus(null);
  }

  function saveScreenshotDrafts() {
    const selectedDrafts = screenshotDrafts.filter((draft) => selectedScreenshotDraftIds.includes(draft.id));
    if (!selectedDrafts.length) {
      Alert.alert('请选择记录', '至少选择一条识别草稿后再导入。');
      return;
    }

    const now = Date.now();
    const jobIdByKey = new Map(activeJobs.map((job) => [`${normalizeText(job.company)}:${normalizeText(job.title)}`, job.id]));
    const createdJobs: Job[] = [];
    const createdInterviews: Interview[] = [];
    const importedInterviewDrafts: Record<number, InterviewDraft> = {};
    const createdNotes: Record<number, JobNote> = {};
    const createdEvents: Record<number, ApplicationEvent[]> = {};
    const jobsToPromote = new Map<number, Job>();
    let mergedJobs = 0;
    let mergedInterviews = 0;
    let autoCreatedJobs = 0;

    selectedDrafts.filter((draft): draft is ScreenshotJobDraft => draft.kind === 'job').forEach((draft, index) => {
      const key = `${normalizeText(draft.job.company)}:${normalizeText(draft.job.title)}`;
      if (draft.duplicateOf && draft.duplicateAction !== 'create') {
        mergedJobs += 1;
        const { id: _draftId, ...jobPatch } = normalizeJobCity(draft.job);
        setJobEdits((current) => ({ ...current, [draft.duplicateOf!]: { ...(current[draft.duplicateOf!] ?? {}), ...jobPatch } }));
        setJobNotes((current) => ({
          ...current,
          [draft.duplicateOf!]: { ...(current[draft.duplicateOf!] ?? emptyJobNote), ...draft.note, sourceConfidence: summarizeConfidence(draft.confidence) },
        }));
        return;
      }
      if (jobIdByKey.has(key) && draft.duplicateAction !== 'create') {
        return;
      }

      const id = now + index;
      const job = normalizeJobCity({ ...draft.job, id });
      createdJobs.push(job);
      jobIdByKey.set(key, id);
      createdNotes[id] = {
        ...emptyJobNote,
        ...draft.note,
        screenshotName: draft.note.screenshotName ?? '招聘截图',
        sourceConfidence: summarizeConfidence(draft.confidence),
      };
      if (job.status !== 'interested') {
        createdEvents[id] = [
          {
            id: id + 1000,
            jobId: id,
            fromStatus: null,
            toStatus: job.status,
            eventTime: new Date().toISOString(),
            note: '由招聘截图批量导入的初始状态',
          },
        ];
      }
    });

    const existingInterviewKeys = new Set(
      interviews.map((item) => `${normalizeText(item.company)}:${normalizeText(item.title)}:${normalizeText(item.round)}:${getInterviewDateTimeKey(item.startsAt, item.id)}`),
    );
    selectedDrafts.filter((draft): draft is ScreenshotInterviewDraft => draft.kind === 'interview').forEach((draft, index) => {
      const interviewKey = `${normalizeText(draft.interview.company)}:${normalizeText(draft.interview.title)}:${normalizeText(draft.interview.round)}:${getInterviewDateTimeKey(draft.interview.startsAt, draft.id)}`;
      if (draft.duplicateOf && draft.duplicateAction !== 'create') {
        mergedInterviews += 1;
        setInterviewEdits((current) => ({ ...current, [draft.duplicateOf!]: { ...(current[draft.duplicateOf!] ?? {}), ...draft.interview } }));
        setInterviewDrafts((current) => ({
          ...current,
          [draft.duplicateOf!]: mergeImportedInterviewDetails(current[draft.duplicateOf!] ?? emptyDraft, draft),
        }));
        return;
      }
      if (existingInterviewKeys.has(interviewKey) && draft.duplicateAction !== 'create') return;

      const jobKey = `${normalizeText(draft.interview.company)}:${normalizeText(draft.interview.title)}`;
      let jobId = draft.linkedJobId ?? [...activeJobs, ...createdJobs].find((job) => isLikelySamePosition(job, draft.interview))?.id;
      if (!jobId) {
        jobId = now + 5000 + index;
        const linkedJob: Job = {
          id: jobId,
          company: draft.interview.company,
          title: draft.interview.title,
          platform: '截图导入',
          city: normalizeCityLabel(draft.city),
          status: 'interviewing',
          salary: draft.salary,
          tags: [],
          resume: resumeVersions[0]?.name ?? '',
        };
        createdJobs.push(linkedJob);
        autoCreatedJobs += 1;
        jobIdByKey.set(jobKey, jobId);
        createdNotes[jobId] = {
          ...emptyJobNote,
          screenshotName: draft.sourceFile,
          applicationSource: '招聘截图 OCR',
          sourceConfidence: summarizeConfidence(draft.confidence),
          jdSummary: draft.interview.jdSummary,
          recruiterName: [draft.contactName, draft.contactTitle].filter(Boolean).join(' · '),
          note: [draft.address ? `面试地址：${draft.address}` : '', draft.notes].filter(Boolean).join('\n'),
        };
        createdEvents[jobId] = [{
          id: jobId + 1000,
          jobId,
          fromStatus: null,
          toStatus: 'interviewing',
          eventTime: new Date().toISOString(),
          note: '由面试截图自动关联创建',
        }];
      }

      const existingJob = activeJobs.find((job) => job.id === jobId);
      if (existingJob && statusOrder.indexOf(existingJob.status) < statusOrder.indexOf('interviewing')) {
        jobsToPromote.set(existingJob.id, existingJob);
      }
      const createdJobIndex = createdJobs.findIndex((job) => job.id === jobId);
      const createdJob = createdJobs[createdJobIndex];
      if (createdJob && statusOrder.indexOf(createdJob.status) < statusOrder.indexOf('interviewing')) {
        createdJobs[createdJobIndex] = { ...createdJob, status: 'interviewing' };
        createdEvents[jobId] = [
          {
            id: jobId + 2000,
            jobId,
            fromStatus: createdJob.status,
            toStatus: 'interviewing',
            eventTime: new Date().toISOString(),
            note: '由同批导入的面试记录自动推进',
          },
          ...(createdEvents[jobId] ?? []),
        ];
      }

      const id = now + 10000 + index;
      createdInterviews.push({ ...draft.interview, id, jobId });
      importedInterviewDrafts[id] = mergeImportedInterviewDetails(emptyDraft, draft);
      existingInterviewKeys.add(interviewKey);
    });

    jobsToPromote.forEach((job) => applyJobStatus(job.id, job.status, 'interviewing', '由导入的面试记录自动推进'));

    if (!createdJobs.length && !createdInterviews.length && !mergedJobs && !mergedInterviews) {
      Alert.alert('没有新增记录', '选中的内容与已有记录重复。');
      return;
    }

    if (createdJobs.length) setCustomJobs((current) => [...createdJobs, ...current]);
    if (createdInterviews.length) setCustomInterviews((current) => [...createdInterviews, ...current]);
    if (Object.keys(importedInterviewDrafts).length) {
      setInterviewDrafts((current) => ({ ...current, ...importedInterviewDrafts }));
    }
    setJobNotes((current) => ({ ...current, ...createdNotes }));
    setJobEvents((current) => ({ ...current, ...createdEvents }));
    if (createdInterviews.length) {
      setSelectedInterviewId(createdInterviews[0].id);
      setShowInterviewDetail(false);
      setActiveTab('interviews');
    } else if (createdJobs.length) {
      setSelectedJobId(createdJobs[0].id);
      setActiveTab('jobs');
    }
    setShowScreenshotDrafts(false);
    setScreenshotDrafts([]);
    setSelectedScreenshotDraftIds([]);
    const summaries = [
      createdJobs.length > autoCreatedJobs ? `新增 ${createdJobs.length - autoCreatedJobs} 个职位` : '',
      createdInterviews.length ? `新增 ${createdInterviews.length} 场面试` : '',
      mergedJobs ? `更新 ${mergedJobs} 个职位` : '',
      mergedInterviews ? `更新 ${mergedInterviews} 场面试` : '',
      autoCreatedJobs ? `岗位已自动添加 ${autoCreatedJobs} 个` : '',
    ].filter(Boolean);
    setImportNotice(summaries.join(' · '));
  }

  function createResumeVersion() {
    const name = newResumeName.trim();
    if (!name) {
      Alert.alert('信息不完整', '简历版本名称是必填项。');
      return;
    }

    const created: ResumeVersion = {
      id: editingResumeId ?? Date.now(),
      name,
      targetRole: newResumeTarget.trim() || '未填写',
      keywords: newResumeKeywords
        .split(/[,，\s]+/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      fileName: newResumeFileName,
      content: newResumeContent.trim(),
    };

    const previousName = resumeVersions.find((resume) => resume.id === editingResumeId)?.name;
    setResumeVersions((current) => editingResumeId
      ? current.map((resume) => resume.id === editingResumeId ? created : resume)
      : [created, ...current]);
    if (editingResumeId && previousName && previousName !== name) {
      setJobResumeOverrides((current) => ({
        ...current,
        ...Object.fromEntries(jobs.filter((job) => job.resume === previousName).map((job) => [job.id, name])),
      }));
    }
    setNewResumeName('');
    setNewResumeTarget('');
    setNewResumeKeywords('');
    setNewResumeFileName('');
    setNewResumeContent('');
    setEditingResumeId(null);
    setShowNewResume(false);
  }

  function openResumeEditor(resume?: ResumeVersion) {
    setEditingResumeId(resume?.id ?? null);
    setNewResumeName(resume?.name ?? '');
    setNewResumeTarget(resume?.targetRole ?? '');
    setNewResumeKeywords(resume?.keywords.join(', ') ?? '');
    setNewResumeFileName(resume?.fileName ?? '');
    setNewResumeContent(resume?.content ?? '');
    setShowNewResume(true);
  }

  async function createFullBackup() {
    const result = await createAndShareFullBackup(getPersistedState());
    setImportNotice(`完整备份已生成 · ${result.audioCount} 段音频`);
  }

  async function restoreFullBackup() {
    const restored = await pickAndRestoreFullBackup();
    if (!restored) return;
    await savePersistedAppState(restored);
    const normalized = await loadPersistedAppState();
    if (!normalized) throw new Error('备份已读取，但恢复后的数据校验失败。');
    applyPersistedState(normalized);
    setSelectedJobId(null);
    setShowInterviewDetail(false);
    setActiveTab('home');
    setMeSection('main');
    setImportNotice('完整备份已恢复，录音与求职记录已重新关联');
  }

  function loadPresentationData() {
    const data = buildPresentationData();
    const jobIds = [...PRESENTATION_JOB_IDS];
    const interviewIds = [...PRESENTATION_INTERVIEW_IDS];
    setCustomJobs((current) => [...data.jobs, ...current.filter((item) => !jobIds.includes(item.id as typeof jobIds[number]))]);
    setCustomInterviews((current) => [...data.interviews, ...current.filter((item) => !interviewIds.includes(item.id as typeof interviewIds[number]))]);
    setJobNotes((current) => ({ ...current, ...data.jobNotes }));
    setJobEvents((current) => ({ ...current, ...data.jobEvents }));
    setInterviewDrafts((current) => ({ ...current, ...data.interviewDrafts }));
    setInterviewResults((current) => ({ ...current, ...data.interviewResults }));
    setInterviewChecklistDone((current) => ({ ...current, ...data.interviewChecklistDone }));
    setInterviewAudioStates((current) => ({
      ...current,
      [PRESENTATION_INTERVIEW_IDS[0]]: '未录音',
      [PRESENTATION_INTERVIEW_IDS[1]]: '已分析',
    }));
    setResumeVersions((current) => [data.resume, ...current.filter((item) => item.id !== PRESENTATION_RESUME_ID)]);
    setHrAnswerRecords((current) => ({ ...current, ...data.hrAnswerRecords }));
    setJobResearchItems((current) => ({ ...current, ...data.jobResearchItems }));
    setJobStatusOverrides((current) => omitRecordKeys(current, jobIds));
    setJobEdits((current) => omitRecordKeys(current, jobIds));
    setInterviewEdits((current) => omitRecordKeys(current, interviewIds));
    setArchivedJobs((current) => omitRecordKeys(current, jobIds));
    setArchivedInterviews((current) => omitRecordKeys(current, interviewIds));
    setHiddenJobIds((current) => current.filter((id) => !jobIds.includes(id as typeof jobIds[number])));
    setHiddenInterviewIds((current) => current.filter((id) => !interviewIds.includes(id as typeof interviewIds[number])));
    setSelectedInterviewId(PRESENTATION_INTERVIEW_IDS[1]);
    setInterviewDetailSection('review');
    setShowInterviewDetail(true);
    setActiveTab('interviews');
    setMeSection('main');
    setImportNotice('展示数据已载入 · 未改动你的已有记录');
  }

  async function createHrAnswer(job: Job, question: string) {
    const resume = resumeVersions.find((item) => item.name === job.resume);
    if (!resume) {
      Alert.alert('未绑定简历', '请先在职位编辑中选择一个简历版本。');
      return;
    }
    if (!resume.content.trim()) {
      Alert.alert('缺少简历正文', '请到“我的 > 简历版本”打开当前版本，并粘贴简历正文。');
      return;
    }
    setHrAnswerBusyJobId(job.id);
    try {
      const suggestion = await generateHrAnswer({
        question,
        job,
        note: jobNotes[job.id] ?? emptyJobNote,
        resume,
        settings: aiServiceSettings,
        apiKey: aiApiKey,
      });
      const record: HrAnswerRecord = {
        id: `${Date.now()}`,
        question: question.trim(),
        ...suggestion,
        resumeName: resume.name,
        createdAt: new Date().toISOString(),
      };
      setHrAnswerRecords((current) => ({
        ...current,
        [job.id]: [record, ...(current[job.id] ?? [])],
      }));
    } catch (error) {
      Alert.alert('生成失败', error instanceof Error ? error.message : '无法生成回答，请检查 AI 配置后重试。');
    } finally {
      setHrAnswerBusyJobId(null);
    }
  }

  async function pickResumeFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled) {
      setNewResumeFileName(result.assets[0]?.name ?? '');
    }
  }

  async function ensureMicrophonePermission() {
    try {
      const current = await getRecordingPermissionsAsync();
      if (current.granted) {
        setMicrophonePermission({ status: current.status, canAskAgain: current.canAskAgain });
        if (Platform.OS === 'android') {
          const notificationPermission = await requestNotificationPermissionsAsync();
          if (!notificationPermission.granted) {
            Alert.alert('需要通知权限', '后台录音需要显示系统常驻通知，请授权后再开始录音。', [
              { text: '取消', style: 'cancel' },
              { text: '打开系统设置', onPress: () => Linking.openSettings() },
            ]);
            return false;
          }
        }
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: true,
          interruptionMode: 'doNotMix',
          playsInSilentMode: true,
        });
        return true;
      }

      if (!current.canAskAgain) {
        setMicrophonePermission({ status: current.status, canAskAgain: false });
        Alert.alert('麦克风权限已关闭', '请在系统设置中为 Expo Go 开启麦克风权限。', [
          { text: '取消', style: 'cancel' },
          { text: '打开系统设置', onPress: () => Linking.openSettings() },
        ]);
        return false;
      }

      const requested = await requestRecordingPermissionsAsync();
      setMicrophonePermission({ status: requested.status, canAskAgain: requested.canAskAgain });
      if (!requested.granted) {
        Alert.alert('没有麦克风权限', '授权后才能开始录音。');
        return false;
      }
      if (Platform.OS === 'android') {
        const notificationPermission = await requestNotificationPermissionsAsync();
        if (!notificationPermission.granted) {
          Alert.alert('需要通知权限', '后台录音需要显示系统常驻通知，请授权后再开始录音。', [
            { text: '取消', style: 'cancel' },
            { text: '打开系统设置', onPress: () => Linking.openSettings() },
          ]);
          return false;
        }
      }
      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: true,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
      });
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      Alert.alert('权限检查失败', detail, [
        { text: '取消', style: 'cancel' },
        { text: '打开系统设置', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
  }

  async function startRecording() {
    setShowCompliance(false);
    if (!(await ensureMicrophonePermission())) {
      return;
    }

    try {
      const storage = await getRecordingStorageInfo();
      setRecordingFreeBytes(storage.freeBytes);
      if (evaluateRecordingStorage(storage.freeBytes) === 'blocked') {
        Alert.alert('存储空间不足', `当前仅剩 ${formatStorageSize(storage.freeBytes)}，请至少释放到 64 MB 后再开始录音。`);
        return;
      }
      audioPlayer.pause();
      if (Platform.OS === 'android') await pauseNativeAudioPlayback().catch(() => undefined);
      await audioRecorder.prepareToRecordAsync(interviewRecordingOptions);
      const fileName = `OfferJing-${Date.now()}.m4a`;
      activeRecordingNameRef.current = fileName;
      await saveActiveRecordingMarker({
        interviewId: selectedInterviewId,
        startedAt: new Date().toISOString(),
        sourceUri: audioRecorder.uri ?? '',
        fileName,
      });
      audioRecorder.record();
      if (audioRecorder.uri) {
        updateActiveRecordingSource(audioRecorder.uri).catch(() => undefined);
      }
      lastAudibleAtRef.current = Date.now();
      recordingLastGrowthAtRef.current = Date.now();
      recordingLastSizeRef.current = 0;
      setRecordingDurationMillis(0);
      setRecordingFileSizeBytes(0);
      setRecordingWriteState('checking');
      setRecordingHealth('unknown');
      setIsRecordingPaused(false);
      setIsRecording(true);
    } catch (error) {
      clearActiveRecordingMarker().catch(() => undefined);
      const detail = error instanceof Error ? error.message : '未知错误';
      Alert.alert('录音启动失败', detail);
    }
  }

  function requestStartRecording() {
    if (hasConfirmedRecordingCompliance) {
      startRecording();
      return;
    }
    setShowCompliance(true);
  }

  function confirmRecordingCompliance() {
    setHasConfirmedRecordingCompliance(true);
    startRecording();
  }

  async function stopRecording() {
    Alert.alert('停止并保存录音', '确认结束当前录音并保存到本地吗？', [
      { text: '继续录音', style: 'cancel' },
      { text: '停止保存', onPress: performStopRecording },
    ]);
  }

  async function performStopRecording() {
    try {
      if (!isRecording) {
        throw new Error('没有正在进行的录音。');
      }
      const durationMillis = audioRecorderState.durationMillis || recordingDurationMillis;
      await audioRecorder.stop();
      setIsRecording(false);
      setIsRecordingPaused(false);
      const uri = audioRecorder.uri;
      if (!uri) {
        throw new Error('录音结束了，但没有生成可保存的文件。');
      }
      await updateActiveRecordingSource(uri);
      const fileName = activeRecordingNameRef.current || `OfferJing-${Date.now()}.m4a`;
      const persistedAudio = await persistAudioFile(uri, fileName, durationMillis);
      updateCurrentDraft({
        ...createFreshAudioAnalysisPatch(),
        savedAudioUri: persistedAudio.uri,
        savedAudioName: fileName,
        audioDurationMillis: durationMillis,
        audioMimeType: 'audio/mp4',
        recordingHealth,
      });
      await clearActiveRecordingMarker();
      activeRecordingNameRef.current = '';
      updateInterviewAudioState('saved');
      updateInterviewEdit(selectedInterviewId, { status: '待复盘' });
    } catch (error) {
      if (!audioRecorder.isRecording) {
        setIsRecording(false);
        setIsRecordingPaused(false);
      }
      const detail = error instanceof Error ? error.message : '录音没有成功保存，请重试。';
      Alert.alert('保存失败', `${detail}\n\n旧录音记录没有被覆盖，当前录音恢复标记也仍然保留。`);
    }
  }

  function pauseRecording() {
    if (!isRecording) return;
    try {
      if (isRecordingPaused) {
        audioRecorder.record();
        lastAudibleAtRef.current = Date.now();
        setRecordingHealth('unknown');
        setIsRecordingPaused(false);
        return;
      }
      audioRecorder.pause();
      setIsRecordingPaused(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '录音状态切换失败。';
      Alert.alert(isRecordingPaused ? '继续录音失败' : '暂停录音失败', detail);
    }
  }

  async function uploadAudio() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) {
      return;
    }

    const file = result.assets[0];
    const localAudio = await persistAudioFile(file.uri, file.name);
    const durationMillis = await getAudioDurationMillis(localAudio.uri).catch(() => 0);
    updateCurrentDraft({
      ...createFreshAudioAnalysisPatch(),
      savedAudioUri: localAudio.uri,
      savedAudioName: file.name,
      audioDurationMillis: durationMillis,
      audioMimeType: file.mimeType ?? '',
      recordingHealth: 'unknown',
    });
    updateInterviewAudioState('saved');
    updateInterviewEdit(selectedInterviewId, { status: '待复盘' });
  }

  async function importJobScreenshot() {
    if (!aiServiceSettings.ocrUrl.trim() || !aiServiceSettings.ocrModel.trim() || !ocrApiKey.trim()) {
      Alert.alert('需要配置截图识别', '请先填写 OCR URL、视觉模型和 API Key。', [
        { text: '取消', style: 'cancel' },
        {
          text: '去配置',
          onPress: () => {
            setMeSection('ai');
            setActiveTab('me');
          },
        },
      ]);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (result.canceled) {
      return;
    }

    setShowScreenshotDrafts(false);
    setScreenshotDrafts([]);
    setSelectedScreenshotDraftIds([]);
    setOcrError('');
    setOcrProgress({ completed: 0, total: result.assets.length });
    const controller = new AbortController();
    ocrAbortControllerRef.current = controller;
    await markLongTaskStarted({
      type: 'ocr',
      startedAt: new Date().toISOString(),
      detail: `识别 ${result.assets.length} 张截图`,
    });
    try {
      const recognized = await recognizeRecruitmentScreenshots({
        files: result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType })),
        settings: aiServiceSettings,
        apiKey: ocrApiKey,
        onProgress: setOcrProgress,
        signal: controller.signal,
      });
      const now = Date.now();
      const interviewPositions = recognized.interviews;
      const standaloneJobs = recognized.jobs.filter((item) =>
        !interviewPositions.some((interview) => isLikelySamePosition(item, interview)),
      );
      const jobDrafts: ScreenshotJobDraft[] = standaloneJobs.map((item, index) => ({
        id: now + index,
        kind: 'job',
        confidence: item.confidence,
        duplicateOf: activeJobs.find((job) => normalizeText(job.company) === normalizeText(item.company) && normalizeText(job.title) === normalizeText(item.title))?.id,
        duplicateAction: 'merge',
        job: {
          id: now + index,
          company: item.company,
          title: item.title,
          platform: item.platform,
          city: item.city,
          status: item.status,
          salary: item.salary,
          tags: Array.from(new Set([...item.tags, item.experience, item.education, item.workMode].filter(Boolean))),
          resume: resumeVersions[0]?.name ?? '',
        },
        note: {
          screenshotName: item.sourceFile,
          applicationSource: '招聘截图 OCR',
          sourceConfidence: summarizeConfidence(item.confidence),
          recordDate: item.recordDate,
          recordTime: item.recordTime,
          recordGroup: item.recordGroup,
          contactMethod: item.contactMethod,
          recruiterName: [item.recruiterName, item.recruiterTitle].filter(Boolean).join(' · '),
          recruitmentState: item.recruitmentState,
          experience: item.experience,
          education: item.education,
          companySize: item.companySize,
          direction: item.industry,
          workMode: item.workMode,
          jdSummary: item.jdSummary,
          note: item.benefits.length ? `岗位福利：${item.benefits.join('、')}` : '',
        },
      }));
      const interviewDrafts: ScreenshotInterviewDraft[] = recognized.interviews.map((item, index) => {
        const linkedJob = activeJobs.find((job) => isLikelySamePosition(job, item));
        return {
        id: now + jobDrafts.length + index,
        kind: 'interview',
        sourceFile: item.sourceFile,
        linkedJobId: linkedJob?.id,
        linkedJobTitle: linkedJob?.title,
        willCreateJob: !linkedJob,
        salary: item.salary,
        city: item.city,
        contactName: item.contactName,
        contactTitle: item.contactTitle,
        address: item.address,
        notes: item.notes,
        confidence: item.confidence,
        duplicateOf: interviews.find((interview) =>
          normalizeText(interview.company) === normalizeText(item.company) &&
          isLikelySamePosition(interview, item) &&
          normalizeText(interview.round) === normalizeText(item.round) &&
          getInterviewDateTimeKey(interview.startsAt, interview.id) === getInterviewDateTimeKey(item.startsAt, now),
        )?.id,
        duplicateAction: 'merge',
        interview: {
          company: item.company,
          title: item.title,
          round: item.round,
          type: item.type,
          startsAt: normalizeInterviewDateTime(item.startsAt, new Date(now)),
          status: item.status,
          audioState: '未录音',
          jdSummary: item.jdSummary,
          checklist: ['确认面试安排', '准备自我介绍', '准备项目案例', '整理反问问题'],
        },
        };
      });
      const drafts: ScreenshotImportDraft[] = [...jobDrafts, ...interviewDrafts];
      if (!drafts.length) throw new Error('截图中没有识别到完整的职位或面试记录。');
      setScreenshotDrafts(drafts);
      setSelectedScreenshotDraftIds(drafts.map((draft) => draft.id));
    } catch (error) {
      setShowScreenshotDrafts(false);
      const detail = error instanceof Error ? error.message : '未知错误';
      if (isAbortError(error)) {
        setOcrError('');
        setImportNotice('截图识别已取消');
        return;
      }
      setOcrError(detail);
      console.error('[screenshot-ocr]', {
        message: detail,
        model: aiServiceSettings.ocrModel,
        endpoint: getUrlHost(aiServiceSettings.ocrUrl),
        imageCount: result.assets.length,
      });
    } finally {
      await clearLongTask().catch(() => undefined);
      if (ocrAbortControllerRef.current === controller) ocrAbortControllerRef.current = null;
      setOcrProgress(null);
    }
  }

  async function waitForPlaybackReady(allowReload = true) {
    const startedAt = Date.now();
    while (!audioPlayer.currentStatus.isLoaded && Date.now() - startedAt < 8_000) {
      if (audioPlayer.currentStatus.error) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (audioPlayer.currentStatus.isLoaded) return audioPlayer.currentStatus;
    if (allowReload && currentDraft.savedAudioUri) {
      audioPlayer.replace({ uri: currentDraft.savedAudioUri });
      return waitForPlaybackReady(false);
    }
    throw new Error(audioPlayer.currentStatus.error || '录音文件尚未载入');
  }

  async function seekPlayback(seconds: number, shouldPlay: boolean) {
    if (!currentDraft.savedAudioUri) {
      setPlaybackRequestState('failed');
      Alert.alert('没有可播放的录音', '这条面试记录只有文字，无法从原音核对。');
      return;
    }
    const requestedSeconds = Math.max(0, seconds);
    setPlaybackTargetSeconds(requestedSeconds);
    setPlaybackRequestState('loading');
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        allowsBackgroundRecording: false,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
      });
      if (Platform.OS === 'android' && supportsNativeAudioPlayback()) {
        const status = await seekNativeAudioPlayback(currentDraft.savedAudioUri, requestedSeconds, shouldPlay);
        setNativePlaybackStatus(bindAudioPlaybackSnapshot(currentDraft.savedAudioUri, status));
        setPlaybackTargetSeconds(status.currentTime);
        setPlaybackRequestState('ready');
        return;
      }
      const readyStatus = await waitForPlaybackReady();
      const durationSeconds = readyStatus.duration || currentDraft.audioDurationMillis / 1000;
      let targetSeconds = clampPlaybackTarget(requestedSeconds, durationSeconds);
      audioPlayer.pause();
      try {
        await withPlaybackTimeout(audioPlayer.seekTo(targetSeconds), 8_000, '定位录音超时');
      } catch (firstError) {
        if (!currentDraft.savedAudioUri) throw firstError;
        audioPlayer.replace({ uri: currentDraft.savedAudioUri });
        const reloadedStatus = await waitForPlaybackReady(false);
        targetSeconds = clampPlaybackTarget(
          requestedSeconds,
          reloadedStatus.duration || currentDraft.audioDurationMillis / 1000,
        );
        await withPlaybackTimeout(audioPlayer.seekTo(targetSeconds), 8_000, '重新载入后定位仍然超时');
      }
      setPlaybackTargetSeconds(targetSeconds);
      if (shouldPlay) {
        audioPlayer.play();
      }
      setPlaybackRequestState('ready');
    } catch (error) {
      setPlaybackRequestState('failed');
      const detail = error instanceof Error ? error.message : '未知播放错误';
      console.error('[audio-playback]', {
        detail,
        requestedSeconds,
        durationSeconds: audioPlayer.currentStatus.duration || currentDraft.audioDurationMillis / 1000,
        isLoaded: audioPlayer.currentStatus.isLoaded,
      });
      Alert.alert('定位原音失败', `${detail}\n\n录音仍然保留，可以再次点击波形重试。`);
    }
  }

  async function togglePlayback() {
    if (playbackStatus.playing) {
      setPlaybackTargetSeconds(playbackStatus.currentTime);
      if (Platform.OS === 'android' && supportsNativeAudioPlayback()) {
        const status = await pauseNativeAudioPlayback();
        if (status && currentDraft.savedAudioUri) {
          setNativePlaybackStatus(bindAudioPlaybackSnapshot(currentDraft.savedAudioUri, status));
        }
        return;
      }
      audioPlayer.pause();
      return;
    }
    const restartFromBeginning = playbackStatus.duration > 0 && playbackStatus.currentTime >= playbackStatus.duration;
    await seekPlayback(restartFromBeginning ? 0 : playbackStatus.currentTime, true);
  }

  async function playAtPlayback(seconds: number) {
    await seekPlayback(seconds, true);
  }

  function keepAudioOnly() {
    updateInterviewAudioState('saved');
    updateInterviewEdit(selectedInterviewId, { status: '待复盘' });
    Alert.alert('已保存', '录音已作为当前面试附件保留，未发起转写或分析。');
  }

  async function generatePreparationForInterview(interviewId: number) {
    if (preparationAiBusyIdsRef.current.has(interviewId)) return;
    const interview = interviews.find((item) => item.id === interviewId);
    if (!interview) return;
    const linkedJob = jobs.find((job) => job.id === interview.jobId) ?? null;
    const linkedJobSummary = linkedJob ? jobNotes[linkedJob.id]?.jdSummary ?? '' : '';
    const jdSummary = isMeaningfulJdSummary(interview.jdSummary)
      ? interview.jdSummary
      : isMeaningfulJdSummary(linkedJobSummary)
        ? linkedJobSummary
        : '';
    preparationAiBusyIdsRef.current.add(interviewId);
    setPreparationAiBusyByInterview((current) => ({ ...current, [interviewId]: true }));
    try {
      const generated = await generateInterviewPreparation({
        interview,
        linkedJob,
        jdSummary,
        settings: aiServiceSettings,
        apiKey: aiApiKey,
      });
      const createdAt = Date.now();
      setInterviewDrafts((current) => {
        const draft = current[interviewId] ?? emptyDraft;
        const existingKeys = new Set(
          draft.preparationMaterials.map((item) => `${item.kind}:${normalizeText(item.title)}`),
        );
        const additions = generated
          .filter((item) => !existingKeys.has(`${item.kind}:${normalizeText(item.title)}`))
          .map((item, index) => ({ ...item, id: `ai-preparation-${interviewId}-${createdAt + index}` }));
        return {
          ...current,
          [interviewId]: {
            ...draft,
            preparationMaterials: [...draft.preparationMaterials, ...additions],
          },
        };
      });
      setImportNotice(`已为 ${interview.company} 补充 AI 准备事项`);
    } catch (error) {
      if (selectedInterviewIdRef.current === interviewId) {
        showAiRequestError(error, () => {
          setActiveTab('me');
          setMeSection('ai');
        });
      } else {
        setImportNotice(`${interview.company} 的 AI 准备事项生成失败，可进入面试重试`);
      }
    } finally {
      preparationAiBusyIdsRef.current.delete(interviewId);
      setPreparationAiBusyByInterview((current) => ({ ...current, [interviewId]: undefined }));
    }
  }

  async function transcribeAudio() {
    const interviewId = selectedInterviewId;
    const draft = { ...currentDraft };
    if (aiTaskKindsRef.current.has(interviewId)) return;
    if (!draft.savedAudioUri || !draft.savedAudioName) {
      Alert.alert('没有可转写的录音', '请先录音并保存，或上传一个音频文件。');
      return;
    }
    const canResume =
      draft.transcriptionState === 'failed' &&
      draft.transcriptionProvider === aiServiceSettings.transcriptionProvider &&
      draft.transcriptionCompletedParts > 0 &&
      draft.transcriptionCompletedParts < draft.transcriptionTotalParts &&
      Boolean(draft.transcript.trim());
    const resume = canResume
      ? {
          completedParts: draft.transcriptionCompletedParts,
          totalParts: draft.transcriptionTotalParts,
          transcript: draft.transcript,
        }
      : undefined;
    setInterviewAiTask(interviewId, 'transcribing');
    setInterviewTranscriptionProgress(
      interviewId,
      canResume
        ? { completed: draft.transcriptionCompletedParts, total: draft.transcriptionTotalParts }
        : { completed: 0, total: 1 },
    );
    updateInterviewDraft(interviewId, {
      transcriptionState: 'processing',
      transcriptionProvider: aiServiceSettings.transcriptionProvider,
      transcriptionError: '',
      transcriptionUpdatedAt: new Date().toISOString(),
      ...(canResume
        ? {}
        : {
            transcript: '',
            transcriptionCompletedParts: 0,
            transcriptionTotalParts: 0,
          }),
    });
    let completedParts = resume?.completedParts ?? 0;
    let totalParts = resume?.totalParts ?? 0;
    let latestPartialTranscript = resume?.transcript ?? '';
    try {
      const transcript = await transcribeInterviewAudio({
        audioUri: draft.savedAudioUri,
        audioName: draft.savedAudioName,
        settings: aiServiceSettings,
        apiKey: aiApiKey,
        tencentCredentials: tencentAsrCredentials,
        resume,
        onProgress: (progress) => setInterviewTranscriptionProgress(interviewId, progress),
        onPartialTranscript: (partialTranscript, completed, total) => {
          completedParts = completed;
          totalParts = total;
          latestPartialTranscript = partialTranscript;
          updateInterviewDraft(interviewId, {
            transcript: partialTranscript,
            transcriptionCompletedParts: completed,
            transcriptionTotalParts: total,
            transcriptionUpdatedAt: new Date().toISOString(),
          });
        },
      });
      updateInterviewDraft(interviewId, {
        transcript,
        transcriptEvidenceBlocks: buildTranscriptEvidenceBlocks(
          transcript,
          Math.max(0, draft.audioDurationMillis / 1000),
        ),
        transcriptQaPairs: [],
        transcriptOrganizationState: 'idle',
        transcriptOrganizationError: '',
        transcriptOrganizationUpdatedAt: '',
        transcriptOrganizationCompletedChunks: 0,
        transcriptOrganizationTotalChunks: 0,
        transcriptionState: 'completed',
        transcriptionProvider: aiServiceSettings.transcriptionProvider,
        transcriptionError: '',
        transcriptionUpdatedAt: new Date().toISOString(),
      });
      updateInterviewAudioStateFor(interviewId, 'transcribed');
      updateInterviewEdit(interviewId, { status: '待复盘' });
      if (selectedInterviewIdRef.current === interviewId) setInterviewDetailSection('review');
      if (aiApiKey.trim() && aiServiceSettings.reviewUrl.trim() && aiServiceSettings.reviewModel.trim()) {
        void organizeTranscriptForInterview(interviewId, transcript, draft.audioDurationMillis);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      const hasResumableProgress = hasResumableTranscript(
        latestPartialTranscript,
        completedParts,
        totalParts,
      );
      updateInterviewDraft(interviewId, {
        transcriptionState: 'failed',
        transcriptionProvider: aiServiceSettings.transcriptionProvider,
        transcriptionError: detail,
        transcriptionUpdatedAt: new Date().toISOString(),
        ...(!hasResumableProgress
          ? {
              transcript: '',
              transcriptionCompletedParts: 0,
              transcriptionTotalParts: 0,
            }
          : {}),
      });
      if (selectedInterviewIdRef.current === interviewId) {
        Alert.alert(
          '转写失败',
          hasResumableProgress
            ? `${detail}\n\n已完成的分段仍然保留，下次可从中断位置继续。`
            : detail,
        );
      } else {
        setImportNotice('一场后台转写未完成，已保留可继续的进度');
      }
    } finally {
      setInterviewAiTask(interviewId, null);
      setInterviewTranscriptionProgress(interviewId, null);
    }
  }

  async function organizeTranscriptForInterview(
    interviewId: number,
    transcript: string,
    durationMillis: number,
    restart = false,
    modeOverride?: InterviewDraft['interviewMode'],
  ) {
    const persistedOrganizationDraft = interviewDrafts[interviewId] ?? emptyDraft;
    const currentEvidenceBlocks = restart || !persistedOrganizationDraft.transcriptEvidenceBlocks.length
      ? buildTranscriptEvidenceBlocks(transcript, Math.max(0, durationMillis / 1000))
      : persistedOrganizationDraft.transcriptEvidenceBlocks;
    const organizationDraft = restart
      ? {
          ...persistedOrganizationDraft,
          ...(modeOverride ? { interviewMode: modeOverride } : {}),
          transcriptQaPairs: [],
          transcriptOrganizationCompletedChunks: 0,
          transcriptOrganizationTotalChunks: 0,
          transcriptEvidenceBlocks: currentEvidenceBlocks,
        }
      : persistedOrganizationDraft;
    setInterviewDrafts((current) => ({
      ...current,
      [interviewId]: {
        ...(current[interviewId] ?? emptyDraft),
        ...(restart ? {
          transcriptQaPairs: [],
          transcriptOrganizationCompletedChunks: 0,
          transcriptOrganizationTotalChunks: 0,
        } : {}),
        transcriptOrganizationState: 'processing',
        transcriptOrganizationError: '',
        transcriptOrganizationUpdatedAt: new Date().toISOString(),
        transcriptEvidenceBlocks: currentEvidenceBlocks,
        ...(modeOverride ? { interviewMode: modeOverride } : {}),
      },
    }));
    try {
      const pairs = await organizeInterviewTranscript({
        transcript,
        durationSeconds: Math.max(0, durationMillis / 1000),
        settings: aiServiceSettings,
        apiKey: aiApiKey,
        existingPairs: organizationDraft.transcriptQaPairs,
        completedChunks: organizationDraft.transcriptOrganizationCompletedChunks,
        onPartial: (partialPairs, completed, total) => setInterviewDrafts((current) => ({
          ...current,
          [interviewId]: {
            ...(current[interviewId] ?? emptyDraft),
            transcriptQaPairs: partialPairs,
            transcriptOrganizationCompletedChunks: completed,
            transcriptOrganizationTotalChunks: total,
            transcriptOrganizationUpdatedAt: new Date().toISOString(),
          },
        })),
        interviewMode: organizationDraft.interviewMode,
        selfSpeakerLabel: organizationDraft.selfSpeakerLabel,
        evidenceBlocks: currentEvidenceBlocks,
      });
      setInterviewDrafts((current) => ({
        ...current,
        [interviewId]: {
          ...(current[interviewId] ?? emptyDraft),
          transcriptQaPairs: pairs,
          transcriptOrganizationState: 'completed',
          transcriptOrganizationError: '',
          transcriptOrganizationCompletedChunks: Math.max(
            current[interviewId]?.transcriptOrganizationCompletedChunks ?? 0,
            current[interviewId]?.transcriptOrganizationTotalChunks ?? 0,
          ),
          transcriptOrganizationUpdatedAt: new Date().toISOString(),
        },
      }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '未知错误';
      setInterviewDrafts((current) => ({
        ...current,
        [interviewId]: {
          ...(current[interviewId] ?? emptyDraft),
          transcriptOrganizationState: 'failed',
          transcriptOrganizationError: detail,
          transcriptOrganizationUpdatedAt: new Date().toISOString(),
        },
      }));
    }
  }

  async function reviewAudio() {
    const interviewId = selectedInterviewId;
    const interview = selectedInterview ? { ...selectedInterview } : null;
    const draft = { ...currentDraft };
    if (!interview || aiTaskKindsRef.current.has(interviewId) || reviewAbortControllersRef.current.has(interviewId)) return;
    const inputIssue = getReviewInputIssue(draft);
    if (inputIssue) {
      Alert.alert('先完成转写', inputIssue, [
        { text: '取消', style: 'cancel' },
        { text: '去录音页', onPress: () => setInterviewDetailSection('record') },
      ], { cancelable: true });
      return;
    }
    setInterviewAiTask(interviewId, 'reviewing');
    setInterviewTranscriptionProgress(interviewId, null);
    const controller = new AbortController();
    reviewAbortControllersRef.current.set(interviewId, controller);
    updateInterviewDraft(interviewId, {
      reviewGenerationState: 'processing',
      reviewGenerationError: '',
      reviewGenerationUpdatedAt: new Date().toISOString(),
    });
    try {
      const transcript = draft.transcript;
      const linkedJob = jobs.find((job) => job.id === interview.jobId) ?? null;
      const reviewHistory = interviews
        .filter((item) => item.id !== interview.id)
        .map((item) => ({ interview: item, draft: interviewDrafts[item.id] }))
        .filter((item) => Boolean(item.draft?.reviewOverall || item.draft?.reviewStrengths || item.draft?.reviewRisks))
        .filter((item) => canReviewPersonalPerformance(item.draft))
        .sort((left, right) => (right.draft.reviewGenerationUpdatedAt || '').localeCompare(left.draft.reviewGenerationUpdatedAt || ''))
        .slice(0, 5)
        .map(({ interview, draft }) => ({
          company: interview.company,
          title: interview.title,
          round: interview.round,
          reviewedAt: draft.reviewGenerationUpdatedAt,
          overall: draft.reviewOverall,
          strengths: draft.reviewStrengths,
          risks: draft.reviewRisks,
          scores: draft.reviewScores,
        }));
      const review = await reviewInterviewTranscript({
        transcript,
        interview,
        linkedJob,
        draft,
        settings: aiServiceSettings,
        apiKey: aiApiKey,
        signal: controller.signal,
        profile: userInterviewProfile,
        history: reviewHistory,
      });
      if (controller.signal.aborted) throw createAbortError();
      const reviewedAt = new Date().toISOString();
      updateInterviewDraft(interviewId, {
        reviewOverall: review.overall,
        reviewStrengths: review.strengths,
        reviewRisks: review.risks,
        reviewScores: review.scores,
        reviewQuestionDetails: review.questionReviews,
        reviewActionItems: review.actionItems,
        reviewProgressComparedWithPast: review.progressComparedWithPast,
        reviewRecurringPatterns: review.recurringPatterns,
        improvedAnswer: review.improvedAnswer,
        manualQuestions: review.questions.length ? review.questions.join('\n') : draft.manualQuestions,
        reviewGenerationState: 'completed',
        reviewGenerationError: '',
        reviewGenerationUpdatedAt: reviewedAt,
      });
      if (canReviewPersonalPerformance(draft)) setUserInterviewProfile((current) => mergeInterviewProfile(current, {
        summary: review.profileSummary,
        strengths: review.profileStrengths.length ? review.profileStrengths : [review.strengths],
        risks: review.profileRisks.length ? review.profileRisks : [review.risks],
        progress: review.progressComparedWithPast,
        recurringPatterns: review.recurringPatterns,
        nextFocus: review.nextFocus.length ? review.nextFocus : review.actionItems,
      }, interview.id, reviewedAt));
      updateInterviewAudioStateFor(interviewId, 'reviewed');
      updateInterviewEdit(interviewId, { status: '待反馈' });
      if (selectedInterviewIdRef.current === interviewId) setInterviewDetailSection('review');
      triggerAppHaptic('success');
    } catch (error) {
      const aborted = controller.signal.aborted || isAbortError(error);
      updateInterviewDraft(interviewId, {
        reviewGenerationState: aborted ? (draft.reviewOverall ? 'completed' : 'idle') : 'failed',
        reviewGenerationError: aborted ? '' : error instanceof Error ? error.message : 'AI 复盘生成失败。',
        reviewGenerationUpdatedAt: new Date().toISOString(),
      });
      if (aborted) {
        setImportNotice('AI 复盘已取消，已有转写和复盘内容未受影响');
        return;
      }
      if (selectedInterviewIdRef.current === interviewId) {
        showAiRequestError(error, () => {
          setActiveTab('me');
          setMeSection('ai');
        });
      } else {
        setImportNotice('一场后台复盘未完成，可进入对应面试查看原因并重试');
      }
    } finally {
      if (reviewAbortControllersRef.current.get(interviewId) === controller) {
        reviewAbortControllersRef.current.delete(interviewId);
      }
      setInterviewAiTask(interviewId, null);
      setInterviewTranscriptionProgress(interviewId, null);
    }
  }

  function addRecordMarker() {
    updateCurrentDraft({
      recordMarkers: [...currentDraft.recordMarkers, `${formatDuration(Math.floor(recordingDurationMillis / 1000))} 重点`],
    });
  }

  function deleteCurrentAudio() {
    if (!currentDraft.savedAudioUri) {
      return;
    }

    Alert.alert('删除录音', '删除后当前面试将不再保留这条录音，本地音频文件也会被移除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteAudioFile(currentDraft.savedAudioUri)
            .then(() => {
              audioPlayer.pause();
              if (Platform.OS === 'android') void pauseNativeAudioPlayback().catch(() => undefined);
              updateCurrentDraft({
                ...createFreshAudioAnalysisPatch(),
                savedAudioUri: null,
                savedAudioName: null,
                audioDurationMillis: 0,
                audioMimeType: '',
                recordingHealth: 'unknown',
                audioWorkState: 'empty',
              });
              setInterviewAudioStates((current) => ({
                ...current,
                [selectedInterviewId]: getAudioStateFromWorkState('empty'),
              }));
            })
            .catch(() => {
              Alert.alert('删除失败', '当前录音没有删除成功，请稍后重试。');
            });
        },
      },
    ]);
  }

  async function runBatchJobResearch() {
    if (batchResearchProgress.status === 'running') return;
    const selectedJobs = activeJobs.filter((job) => batchResearchSelectedIds.includes(job.id));
    if (!selectedJobs.length) {
      Alert.alert('还没有选择职位', '请至少选择一个需要调研的职位。');
      return;
    }
    if (!aiServiceSettings.researchMcpUrl?.trim()) {
      Alert.alert('MCP 尚未配置', '请先在“我的 → AI 与转写”中填写小红书 MCP 地址并测试连接。');
      return;
    }
    if (!aiServiceSettings.reviewUrl.trim() || !aiServiceSettings.reviewModel.trim() || !aiApiKey.trim()) {
      Alert.alert('汇总模型尚未配置', '批量调研需要复盘模型生成每个岗位的结构化总结。');
      return;
    }

    setBatchResearchProgress({
      status: 'running',
      completedJobs: 0,
      totalJobs: selectedJobs.length,
      currentJobId: selectedJobs[0].id,
      detail: `准备调研 ${selectedJobs[0].company}`,
    });
    const controller = new AbortController();
    researchAbortControllerRef.current = controller;
    await markLongTaskStarted({
      type: 'research',
      startedAt: new Date().toISOString(),
      detail: `调研 ${selectedJobs.length} 个岗位`,
    });
    let completedJobs = 0;
    const sourcesByCompany = new Map<string, JobResearchSource[]>();
    try {
      for (const job of selectedJobs) {
        if (controller.signal.aborted) throw createAbortError();
        const note = { ...emptyJobNote, ...(jobNotes[job.id] ?? {}) };
        setBatchResearchProgress({
          status: 'running',
          completedJobs,
          totalJobs: selectedJobs.length,
          currentJobId: job.id,
          detail: `正在调研 ${job.company} · ${job.title}`,
        });

        const companyKey = job.company.trim().toLocaleLowerCase();
        const sharedCompanySources = sourcesByCompany.get(companyKey) ?? [];
        const cachedSources = recentMcpResearchSources(jobResearchItems[job.id] ?? []);
        let sources: JobResearchSource[];
        if (sharedCompanySources.length) {
          sources = sharedCompanySources;
          setBatchResearchProgress({
            status: 'running',
            completedJobs,
            totalJobs: selectedJobs.length,
            currentJobId: job.id,
            detail: `复用本批次 ${job.company} 的公司资料`,
          });
          const createdAt = new Date().toISOString();
          setJobResearchItems((current) => ({
            ...current,
            [job.id]: [
              ...sources.map((source, index) => ({
                id: `mcp-${job.id}-${Date.now()}-${index}`,
                source: 'xiaohongshu' as const,
                title: source.title,
                url: source.url,
                note: `[MCP自动调研]\n${source.content.slice(0, 8_000)}`,
                createdAt,
              })),
              ...(current[job.id] ?? []),
            ],
          }));
        } else if (cachedSources.length >= 2) {
          sources = cachedSources;
          setBatchResearchProgress({
            status: 'running',
            completedJobs,
            totalJobs: selectedJobs.length,
            currentJobId: job.id,
            detail: `复用 ${job.company} 近 7 天调研资料`,
          });
        } else {
          sources = await researchJobWithXiaohongshuMcp({
            endpoint: aiServiceSettings.researchMcpUrl,
            job,
            maxNotes: 4,
            commentLimit: 10,
            onProgress: (progress) => setBatchResearchProgress({
              status: 'running',
              completedJobs,
              totalJobs: selectedJobs.length,
              currentJobId: job.id,
              detail: `${job.company} · ${progress.detail}`,
            }),
            signal: controller.signal,
          });
          const createdAt = new Date().toISOString();
          const newItems: JobResearchItem[] = sources.map((source, index) => ({
            id: `mcp-${job.id}-${Date.now()}-${index}`,
            source: 'xiaohongshu',
            title: source.title,
            url: source.url,
            note: `[MCP自动调研]\n${source.content.slice(0, 8_000)}`,
            createdAt,
          }));
          setJobResearchItems((current) => ({
            ...current,
            [job.id]: [...newItems, ...(current[job.id] ?? [])],
          }));
        }
        sourcesByCompany.set(companyKey, sources);

        setBatchResearchProgress({
          status: 'running',
          completedJobs,
          totalJobs: selectedJobs.length,
          currentJobId: job.id,
          detail: `正在汇总 ${job.company}`,
        });
        const summary = await summarizeJobResearch({
          job,
          note,
          preset: 'risk',
          question: '重点判断公司口碑、面试体验、加班与管理风险；区分疑似官方宣传和普通用户经验。',
          sources,
          settings: aiServiceSettings,
          apiKey: aiApiKey,
          signal: controller.signal,
        });
        const summaryText = formatResearchNote(summary, 'risk');
        setJobNotes((current) => {
          const currentNote = { ...emptyJobNote, ...(current[job.id] ?? {}) };
          return {
            ...current,
            [job.id]: {
              ...currentNote,
              note: mergeAutomaticResearchSummary(currentNote.note, summaryText),
            },
          };
        });
        completedJobs += 1;
      }
      setBatchResearchProgress({
        status: 'completed',
        completedJobs,
        totalJobs: selectedJobs.length,
        currentJobId: null,
        detail: `已完成 ${completedJobs} 个岗位的调研与汇总`,
      });
      setImportNotice(`批量调研完成 · ${completedJobs} 个岗位`);
    } catch (error) {
      if (isAbortError(error)) {
        setBatchResearchProgress({
          status: 'cancelled',
          completedJobs,
          totalJobs: selectedJobs.length,
          currentJobId: null,
          detail: completedJobs ? `已停止，保留 ${completedJobs} 个岗位的结果。` : '已停止，本次没有写入调研结果。',
        });
        return;
      }
      setBatchResearchProgress({
        status: 'failed',
        completedJobs,
        totalJobs: selectedJobs.length,
        currentJobId: null,
        detail: error instanceof Error ? error.message : '批量调研没有成功完成。',
      });
    } finally {
      await clearLongTask().catch(() => undefined);
      if (researchAbortControllerRef.current === controller) researchAbortControllerRef.current = null;
    }
  }

  const isNestedScreen =
    (activeTab === 'jobs' && Boolean(selectedJob)) ||
    (activeTab === 'interviews' && showInterviewDetail);
  const showPersistentReviewPlayer = Boolean(
    activeTab === 'interviews'
    && showInterviewDetail
    && interviewDetailSection === 'review'
    && activeReviewContentView === 'evidence'
    && currentDraft.savedAudioUri,
  );

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top + SCREEN_TOP_GAP, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        {!isNestedScreen && activeTab !== 'home' ? (
          <Header
            activeTab={activeTab}
            onCreateJob={() => {
              setPendingScreenshotName('');
              setPendingScreenshotNote({});
              setPendingJobStatus(null);
              setShowNewJob(true);
            }}
            onCreateInterview={() => setShowNewInterview(true)}
            onImportScreenshot={importJobScreenshot}
          />
        ) : null}

        {activeTab === 'jobs' && selectedJob ? (
          <NavigationBar
            fixed
            title={isEditingJob ? '编辑职位' : '职位详情'}
            onBack={() => isEditingJob ? setIsEditingJob(false) : setSelectedJobId(null)}
            actionLabel={isEditingJob ? '保存' : '编辑'}
            onAction={() => setIsEditingJob((value) => !value)}
          />
        ) : activeTab === 'interviews' && showInterviewDetail && selectedInterview ? (
          <NavigationBar
            fixed
            title={{ prepare: '面试准备', record: '面试录音', review: '面试复盘', followup: '面试跟进' }[interviewDetailSection]}
            onBack={() => setShowInterviewDetail(false)}
          />
        ) : null}

        <ScrollView
          ref={mainScrollRef}
          contentContainerStyle={[
            styles.content,
            isCompact && styles.contentCompact,
            isWide && styles.contentWide,
            { paddingBottom: showPersistentReviewPlayer ? 148 : isNestedScreen ? 28 : 110 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'home' && (
            <HomeDashboard
              section={homeSection}
              insightSection={homeInsightSection}
              upcomingInterviews={upcomingInterviews}
              metrics={metrics}
              jobs={homeJobs}
              jobNotes={jobNotes}
              interviews={homeInterviews}
              dateRange={homeDateRange}
              interviewChecklistDone={interviewChecklistDone}
              interviewDrafts={interviewDrafts}
              interviewResults={interviewResults}
              ocrProgress={ocrProgress}
              pendingOcrCount={screenshotDrafts.length}
              ocrError={ocrError}
              batchResearchProgress={batchResearchProgress}
              onSectionChange={setHomeSection}
              onDateRangeChange={setHomeDateRange}
              onInsightSectionChange={setHomeInsightSection}
              onMetricPress={setHomeMetricDetail}
              onOpenInterviewPrepare={(interviewId) => {
                setSelectedInterviewId(interviewId);
                setActiveTab('interviews');
                setShowInterviewDetail(true);
                setInterviewDetailSection('prepare');
              }}
              onOpenJobTask={(jobId, section) => {
                setSelectedJobId(jobId);
                setJobDetailSection(section);
                setActiveTab('jobs');
              }}
              onOpenInterviewTask={(interviewId, section) => {
                setSelectedInterviewId(interviewId);
                setInterviewDetailSection(section);
                setShowInterviewDetail(true);
                setActiveTab('interviews');
              }}
              onOpenOcrTask={() => {
                if (ocrProgress) {
                  Alert.alert(
                    '正在识别招聘截图',
                    `已完成 ${ocrProgress.completed}/${ocrProgress.total} 张，可以继续使用其他功能。`,
                    [
                      { text: '继续识别', style: 'cancel' },
                      { text: '取消任务', style: 'destructive', onPress: () => ocrAbortControllerRef.current?.abort() },
                    ],
                  );
                  return;
                }
                if (screenshotDrafts.length) {
                  setShowScreenshotDrafts(true);
                  return;
                }
                if (ocrError) {
                  Alert.alert('截图识别失败', ocrError, [
                    { text: '关闭', onPress: () => setOcrError('') },
                  ]);
                }
              }}
              onOpenResearchTask={() => {
                setActiveTab('jobs');
                setShowBatchResearch(true);
              }}
            />
          )}
          {activeTab === 'jobs' && (
            selectedJob ? (
              <JobDetailWorkspace
                section={jobDetailSection}
                job={selectedJob}
                note={selectedJobNote}
                events={jobEvents[selectedJob.id] ?? []}
                linkedInterviews={interviews.filter((interview) => interview.jobId === selectedJob.id)}
                interviewResults={interviewResults}
                resumeVersions={resumeVersions}
                hrAnswerRecords={hrAnswerRecords[selectedJob.id] ?? []}
                hrAnswerBusy={hrAnswerBusyJobId === selectedJob.id}
                researchApiKey={researchApiKey}
                researchItems={jobResearchItems[selectedJob.id] ?? []}
                aiSettings={aiServiceSettings}
                aiApiKey={aiApiKey}
                isEditing={isEditingJob}
                onEdit={() => setIsEditingJob(true)}
                onSectionChange={setJobDetailSection}
                onBack={() => setSelectedJobId(null)}
                onCycleStatus={cycleJobStatus}
                onCreateInterview={openInterviewFormForJob}
                onUpdateJob={updateJobEdit}
                onUpdateJobNote={updateJobNote}
                onBindResume={(resumeName) =>
                  setJobResumeOverrides((current) => ({ ...current, [selectedJob.id]: resumeName }))
                }
                onOpenInterview={(interviewId, section) => {
                  setSelectedInterviewId(interviewId);
                  setInterviewDetailSection(section);
                  setShowInterviewDetail(true);
                  setActiveTab('interviews');
                }}
                onGenerateHrAnswer={(question) => createHrAnswer(selectedJob, question)}
                onDeleteHrAnswer={(recordId) => {
                  setHrAnswerRecords((current) => ({
                    ...current,
                    [selectedJob.id]: (current[selectedJob.id] ?? []).filter((record) => record.id !== recordId),
                  }));
                }}
                onOpenResumeEditor={(resume) => {
                  if (resume) {
                    openResumeEditor(resume);
                    return;
                  }
                  setMeSection('resumes');
                  setSelectedJobId(null);
                  setActiveTab('me');
                }}
                onOpenAiSettings={() => {
                  setMeSection('ai');
                  setSelectedJobId(null);
                  setActiveTab('me');
                }}
                isArchived={Boolean(archivedJobs[selectedJob.id])}
                onToggleArchive={() => {
                  if (archivedJobs[selectedJob.id]) {
                    setArchivedJobs((current) => omitRecordKeys(current, [selectedJob.id]));
                    setImportNotice('职位已恢复到当前列表');
                    return;
                  }
                  setArchivedJobs((current) => ({ ...current, [selectedJob.id]: new Date().toISOString() }));
                  setSelectedJobId(null);
                  setImportNotice('职位与关联面试已归档，可在“我的 · 历史档案”恢复');
                }}
                onSaveResearchItem={(item) => setJobResearchItems((current) => ({
                  ...current,
                  [selectedJob.id]: [item, ...(current[selectedJob.id] ?? [])],
                }))}
                onDelete={deleteJob}
              />
            ) : (
              <JobsScreen
                jobs={filteredJobs}
                jobNotes={jobNotes}
                jobEvents={jobEvents}
                interviews={interviews}
                interviewResults={interviewResults}
                search={jobSearch}
                statusFilter={jobStatusFilter}
                dateBasis={jobDateBasis}
                dateRange={jobDateRange}
                onSearchChange={setJobSearch}
                onStatusFilterChange={setJobStatusFilter}
                onOpenFilters={() => setShowJobFilters(true)}
                onOpenBatchResearch={() => {
                  if (batchResearchProgress.status !== 'running') {
                    setBatchResearchSelectedIds((current) => current.filter((id) => filteredJobs.some((job) => job.id === id)));
                  }
                  setShowBatchResearch(true);
                }}
                batchResearchProgress={batchResearchProgress}
                selectedIds={jobSelectionIds}
                onSelectedIdsChange={setJobSelectionIds}
                onSelectJob={setSelectedJobId}
                onCycleStatus={cycleJobStatus}
                onArchiveSelected={archiveSelectedJobs}
                onDeleteSelected={deleteSelectedJobs}
                onImportScreenshot={importJobScreenshot}
              />
            )
          )}
          {activeTab === 'interviews' && (
            <InterviewWorkspace
              section={interviewDetailSection}
              interviews={filteredInterviews}
              allJobs={jobs}
              jobNotes={jobNotes}
              interviewDrafts={interviewDrafts}
              search={interviewSearch}
              onSearchChange={setInterviewSearch}
              listFilter={interviewListFilter}
              dateRange={interviewDateRange}
              onListFilterChange={setInterviewListFilter}
              onDateRangeChange={setInterviewDateRange}
              showDetail={showInterviewDetail}
              selectedInterviewId={selectedInterviewId}
              onSelectInterview={(id) => {
                setSelectedInterviewId(id);
                setShowInterviewDetail(true);
              }}
              onBackToList={() => setShowInterviewDetail(false)}
              durationText={durationText}
              isRecording={isRecording}
              isRecordingPaused={isRecordingPaused}
              recordingHealth={recordingHealth}
              recordingFileSizeBytes={recordingFileSizeBytes}
              recordingFreeBytes={recordingFreeBytes}
              recordingWriteState={recordingWriteState}
              savedAudioFileSizeBytes={savedAudioFileSizeBytes}
              savedAudioDurationMillis={currentDraft.audioDurationMillis}
              recordingMetering={audioRecorderState.metering}
              savedAudioUri={currentDraft.savedAudioUri}
              savedAudioName={currentDraft.savedAudioName}
              audioWorkState={currentDraft.audioWorkState}
              microphonePermission={microphonePermission}
              aiBusy={aiTasksByInterview[selectedInterviewId] ?? null}
              transcriptionProgress={transcriptionProgressByInterview[selectedInterviewId] ?? null}
              transcriptionState={currentDraft.transcriptionState}
              transcriptionError={currentDraft.transcriptionError}
              transcriptionCompletedParts={currentDraft.transcriptionCompletedParts}
              transcriptionTotalParts={currentDraft.transcriptionTotalParts}
              transcriptionProvider={aiServiceSettings.transcriptionProvider}
              aiConfigured={Boolean(
                aiApiKey.trim() && aiServiceSettings.reviewUrl.trim() && aiServiceSettings.reviewModel.trim(),
              )}
              result={interviewResults[selectedInterviewId] ?? '待反馈'}
              interviewResults={interviewResults}
              playbackCurrentTime={playbackStatus.currentTime}
              playbackDuration={playbackStatus.duration || currentDraft.audioDurationMillis / 1000}
              isPlaying={playbackStatus.playing}
              playbackTargetSeconds={playbackTargetSeconds}
              playbackRequestState={playbackRequestState}
              transcript={currentDraft.transcript}
              transcriptQaPairs={currentDraft.transcriptQaPairs}
              transcriptOrganizationState={currentDraft.transcriptOrganizationState}
              transcriptOrganizationError={currentDraft.transcriptOrganizationError}
              transcriptOrganizationCompletedChunks={currentDraft.transcriptOrganizationCompletedChunks}
              transcriptOrganizationTotalChunks={currentDraft.transcriptOrganizationTotalChunks}
              note={currentDraft.note}
              interviewerName={currentDraft.interviewerName}
              interviewerTitle={currentDraft.interviewerTitle}
              endAt={currentDraft.endAt}
              selfIntroduction={currentDraft.selfIntroduction}
              projectStories={currentDraft.projectStories}
              companyResearch={currentDraft.companyResearch}
              roleUnderstanding={currentDraft.roleUnderstanding}
              manualQuestions={currentDraft.manualQuestions}
              improvedAnswer={currentDraft.improvedAnswer}
              reviewOverall={currentDraft.reviewOverall}
              reviewStrengths={currentDraft.reviewStrengths}
              reviewRisks={currentDraft.reviewRisks}
              reviewScores={currentDraft.reviewScores}
              reviewQuestionDetails={currentDraft.reviewQuestionDetails}
              reviewActionItems={currentDraft.reviewActionItems}
              reviewProgressComparedWithPast={currentDraft.reviewProgressComparedWithPast}
              reviewRecurringPatterns={currentDraft.reviewRecurringPatterns}
              reviewGenerationError={currentDraft.reviewGenerationError}
              reviewGenerationState={currentDraft.reviewGenerationState}
              interviewMode={currentDraft.interviewMode}
              selfSpeakerLabel={currentDraft.selfSpeakerLabel}
              questionsForInterviewer={currentDraft.questionsForInterviewer}
              followUpAction={currentDraft.followUpAction}
              reminderAt={currentDraft.reminderAt}
              recordMarkers={currentDraft.recordMarkers}
              preparationMaterials={currentDraft.preparationMaterials}
              preparationAiBusy={Boolean(preparationAiBusyByInterview[selectedInterviewId])}
              checklistDone={interviewChecklistDone[selectedInterviewId] ?? {}}
              onShowCompliance={requestStartRecording}
              onCheckMicrophonePermission={ensureMicrophonePermission}
              onPause={pauseRecording}
              onStop={stopRecording}
              onUpload={uploadAudio}
              onTogglePlayback={togglePlayback}
              onPlayAtPlayback={playAtPlayback}
              onSeekPlayback={(seconds) => {
                void seekPlayback(seconds, false);
              }}
              onResultChange={setCurrentInterviewResult}
              onCreateNextRound={() => selectedInterview && openNextRoundInterview(selectedInterview)}
              onKeepOnly={keepAudioOnly}
              onTranscribe={transcribeAudio}
              onReview={reviewAudio}
              onCancelReview={() => reviewAbortControllersRef.current.get(selectedInterviewId)?.abort()}
              onTranscriptChange={(text) => updateCurrentDraft({
                transcript: text,
                transcriptQaPairs: [],
                transcriptOrganizationState: 'idle',
                transcriptOrganizationError: '',
              transcriptOrganizationUpdatedAt: '',
              transcriptOrganizationCompletedChunks: 0,
              transcriptOrganizationTotalChunks: 0,
              })}
              onOrganizeTranscript={() => organizeTranscriptForInterview(selectedInterviewId, currentDraft.transcript, currentDraft.audioDurationMillis)}
              onReorganizeTranscript={() => organizeTranscriptForInterview(selectedInterviewId, currentDraft.transcript, currentDraft.audioDurationMillis, true, 'individual')}
              onReorganizeTranscriptAsGroup={() => organizeTranscriptForInterview(selectedInterviewId, currentDraft.transcript, currentDraft.audioDurationMillis, true, 'group')}
              onNoteChange={(text) => updateCurrentDraft({ note: text })}
              onQuestionsChange={(text) => updateCurrentDraft({ questionsForInterviewer: text })}
              onFollowUpActionChange={(text) => updateCurrentDraft({ followUpAction: text })}
              onInterviewerNameChange={(text) => updateCurrentDraft({ interviewerName: text })}
              onInterviewerTitleChange={(text) => updateCurrentDraft({ interviewerTitle: text })}
              onEndAtChange={(text) => updateCurrentDraft({ endAt: text })}
              onSelfIntroductionChange={(text) => updateCurrentDraft({ selfIntroduction: text })}
              onProjectStoriesChange={(text) => updateCurrentDraft({ projectStories: text })}
              onCompanyResearchChange={(text) => updateCurrentDraft({ companyResearch: text })}
              onRoleUnderstandingChange={(text) => updateCurrentDraft({ roleUnderstanding: text })}
              onManualQuestionsChange={(text) => updateCurrentDraft({ manualQuestions: text })}
              onImprovedAnswerChange={(text) => updateCurrentDraft({ improvedAnswer: text })}
              onReviewOverallChange={(text) => updateCurrentDraft({ reviewOverall: text })}
              onReviewStrengthsChange={(text) => updateCurrentDraft({ reviewStrengths: text })}
              onReviewRisksChange={(text) => updateCurrentDraft({ reviewRisks: text })}
              onInterviewModeChange={(value) => updateCurrentDraft({ interviewMode: value, selfSpeakerLabel: value === 'group' ? currentDraft.selfSpeakerLabel : '' })}
              onSelfSpeakerLabelChange={(text) => updateCurrentDraft({ selfSpeakerLabel: text })}
              onClearReview={() => updateCurrentDraft({ reviewOverall: '', reviewStrengths: '', reviewRisks: '', improvedAnswer: '', manualQuestions: '', reviewScores: {}, reviewQuestionDetails: [], reviewActionItems: [], reviewProgressComparedWithPast: '', reviewRecurringPatterns: [], reviewGenerationState: 'idle', reviewGenerationError: '' })}
              onReminderAtChange={(text) => updateCurrentDraft({ reminderAt: text })}
              onPreparationMaterialsChange={(materials) => updateCurrentDraft({ preparationMaterials: materials })}
              onGeneratePreparation={() => generatePreparationForInterview(selectedInterviewId)}
              onToggleChecklistItem={(item) => toggleChecklistItem(selectedInterviewId, item)}
              onDeleteAudio={() => deleteCurrentAudio()}
              onAddRecordMarker={addRecordMarker}
              onDeleteInterview={deleteInterview}
              selectedListIds={interviewSelectionIds}
              onSelectedListIdsChange={setInterviewSelectionIds}
              onArchiveSelected={archiveSelectedInterviews}
              onDeleteSelected={deleteSelectedInterviews}
              onSetSelectedStatus={(ids, status) => {
                setInterviewEdits((current) => ({
                  ...current,
                  ...Object.fromEntries(ids.map((id) => [id, { ...(current[id] ?? {}), status }])),
                }));
                setInterviewSelectionIds([]);
              }}
              onUpdateInterview={updateInterviewEdit}
              onCreateInterview={() => setShowNewInterview(true)}
              onOpenMockInterview={() => setShowMockInterview(true)}
              onSectionChange={setInterviewDetailSection}
              onReviewContentViewChange={setActiveReviewContentView}
              onOpenJob={(jobId) => {
                setSelectedJobId(jobId);
                setActiveTab('jobs');
              }}
              hideNavigationBar={showInterviewDetail}
            />
          )}
          {activeTab === 'me' && (
            <MeScreen
              section={meSection}
              jobs={jobs}
              interviews={interviews}
              jobNotes={jobNotes}
              jobEvents={jobEvents}
              interviewChecklistDone={interviewChecklistDone}
              interviewDrafts={interviewDrafts}
              interviewResults={interviewResults}
              resumeVersions={resumeVersions}
              hrAnswerRecords={hrAnswerRecords}
              jobResearchItems={jobResearchItems}
              archivedJobs={archivedJobs}
              archivedInterviews={archivedInterviews}
              userPreferences={userPreferences}
              userInterviewProfile={userInterviewProfile}
              aiServiceSettings={aiServiceSettings}
              aiApiKey={aiApiKey}
              ocrApiKey={ocrApiKey}
              researchApiKey={researchApiKey}
              tencentAsrCredentials={tencentAsrCredentials}
              senseVoiceModelState={senseVoiceModelState}
              onSectionChange={setMeSection}
              onOpenHrDemo={() => setShowHrDemo(true)}
              onLoadPresentationData={loadPresentationData}
              onOpenJobTask={(jobId, section) => {
                setSelectedJobId(jobId);
                setJobDetailSection(section);
                setActiveTab('jobs');
              }}
              onOpenInterviewTask={(interviewId, section) => {
                setSelectedInterviewId(interviewId);
                setInterviewDetailSection(section);
                setShowInterviewDetail(true);
                setActiveTab('interviews');
              }}
              onUpdatePreferences={(patch) =>
                setUserPreferences((current) => ({
                  ...current,
                  ...patch,
                }))
              }
              onUpdateInterviewProfile={(patch) => setUserInterviewProfile((current) => ({
                ...current,
                ...patch,
                updatedAt: new Date().toISOString(),
              }))}
              onUpdateAiSettings={(patch) =>
                setAiServiceSettings((current) => ({
                  ...current,
                  ...patch,
                }))
              }
              onChangeAiApiKey={setAiApiKey}
              onChangeOcrApiKey={setOcrApiKey}
              onChangeResearchApiKey={setResearchApiKey}
              onUpdateTencentAsrCredentials={(patch) =>
                setTencentAsrCredentials((current) => ({ ...current, ...patch }))
              }
              onSaveAiApiKey={() => {
                if (!aiApiKey.trim()) {
                  Alert.alert('密钥为空', '请先填写 API Key。');
                  return;
                }
                saveAiApiKey(aiApiKey)
                  .then(() => Alert.alert('已保存', 'API Key 已保存到系统安全存储。'))
                  .catch((error: unknown) => {
                    const detail = error instanceof Error ? error.message : '未知错误';
                    Alert.alert('保存失败', `API Key 没有成功写入系统安全存储。\n\n${detail}`);
                  });
              }}
              onClearAiApiKey={() => {
                clearAiApiKey()
                  .then(() => {
                    setAiApiKey('');
                    Alert.alert('已清除', '系统安全存储中的 API Key 已删除。');
                  })
                  .catch((error: unknown) => {
                    const detail = error instanceof Error ? error.message : '未知错误';
                    Alert.alert('清除失败', `API Key 没有成功删除。\n\n${detail}`);
                  });
              }}
              onSaveOcrApiKey={() => {
                if (!ocrApiKey.trim()) {
                  Alert.alert('密钥为空', '请先填写截图识别 API Key。');
                  return;
                }
                saveOcrApiKey(ocrApiKey)
                  .then(() => Alert.alert('已保存', '截图识别 API Key 已保存到系统安全存储。'))
                  .catch((error: unknown) => {
                    const detail = error instanceof Error ? error.message : '未知错误';
                    Alert.alert('保存失败', `截图识别 API Key 没有成功写入。\n\n${detail}`);
                  });
              }}
              onClearOcrApiKey={() => {
                clearOcrApiKey()
                  .then(() => {
                    setOcrApiKey('');
                    Alert.alert('已清除', '截图识别 API Key 已删除。');
                  })
                  .catch((error: unknown) => Alert.alert('清除失败', error instanceof Error ? error.message : '未知错误'));
              }}
              onSaveResearchApiKey={() => {
                if (!researchApiKey.trim()) {
                  Alert.alert('密钥为空', '请先填写 Jina Search API Key。');
                  return;
                }
                saveResearchApiKey(researchApiKey)
                  .then(() => Alert.alert('已保存', '在线调研密钥已保存到系统安全存储。'))
                  .catch((error: unknown) => Alert.alert('保存失败', error instanceof Error ? error.message : '在线调研密钥没有成功写入。'));
              }}
              onClearResearchApiKey={() => {
                clearResearchApiKey()
                  .then(() => {
                    setResearchApiKey('');
                    Alert.alert('已清除', '在线调研密钥已删除。');
                  })
                  .catch((error: unknown) => Alert.alert('清除失败', error instanceof Error ? error.message : '未知错误'));
              }}
              onSaveTencentAsrCredentials={() => {
                if (!tencentAsrCredentials.appId.trim() || !tencentAsrCredentials.secretId.trim() || !tencentAsrCredentials.secretKey.trim()) {
                  Alert.alert('凭据不完整', '请填写 AppID、SecretID 和 SecretKey。');
                  return;
                }
                saveTencentAsrCredentials(tencentAsrCredentials)
                  .then(() => Alert.alert('已保存', '腾讯云凭据已保存到系统安全存储。'))
                  .catch((error: unknown) => {
                    const detail = error instanceof Error ? error.message : '未知错误';
                    Alert.alert('保存失败', `腾讯云凭据没有成功写入。\n\n${detail}`);
                  });
              }}
              onClearTencentAsrCredentials={() => {
                clearTencentAsrCredentials()
                  .then(() => {
                    setTencentAsrCredentials({ appId: '', secretId: '', secretKey: '' });
                    Alert.alert('已清除', '腾讯云凭据已删除。');
                  })
                  .catch((error: unknown) => {
                    const detail = error instanceof Error ? error.message : '未知错误';
                    Alert.alert('清除失败', detail);
                  });
              }}
              onPrepareSenseVoice={() => {
                setSenseVoiceModelState({ status: 'preparing', percent: 0, detail: '正在检查模型' });
                prepareSenseVoiceModel((progress) => {
                  const phase = progress.phase === 'extracting' ? '正在解压' : progress.phase === 'downloading' ? '正在下载' : '正在检查';
                  setSenseVoiceModelState({
                    status: progress.phase === 'ready' ? 'ready' : 'preparing',
                    percent: progress.percent,
                    detail: progress.phase === 'ready' ? '模型已就绪' : `${phase} ${progress.percent}%`,
                  });
                })
                  .then(() => {
                    setSenseVoiceModelState({ status: 'ready', percent: 100, detail: '模型已就绪，可离线转写' });
                    Alert.alert('准备完成', 'SenseVoice 已可离线使用。');
                  })
                  .catch((error: unknown) => {
                    const detail = error instanceof Error ? error.message : '模型准备失败';
                    setSenseVoiceModelState({ status: 'failed', percent: 0, detail });
                    Alert.alert('模型准备失败', detail);
                  });
              }}
              onCreateFullBackup={createFullBackup}
              onRestoreFullBackup={restoreFullBackup}
              onCreateResume={() => openResumeEditor()}
              onEditResume={openResumeEditor}
              onArchiveJobs={(jobIds) => {
                const archivedAt = new Date().toISOString();
                setArchivedJobs((current) => ({
                  ...current,
                  ...Object.fromEntries(jobIds.map((jobId) => [jobId, archivedAt])),
                }));
                setImportNotice(`已归档 ${jobIds.length} 个职位，关联面试和录音均已保留`);
              }}
              onRestoreJob={(jobId) => {
                setArchivedJobs((current) => omitRecordKeys(current, [jobId]));
                setImportNotice('职位已恢复到当前列表');
              }}
              onRestoreInterview={(interviewId) => {
                setArchivedInterviews((current) => omitRecordKeys(current, [interviewId]));
                setImportNotice('面试已恢复到当前列表');
              }}
            />
          )}
        </ScrollView>

        {showPersistentReviewPlayer ? (
          <PersistentReviewPlayer
            title={selectedInterview?.company ?? '面试录音'}
            currentTime={playbackStatus.currentTime || playbackTargetSeconds || 0}
            duration={playbackStatus.duration || currentDraft.audioDurationMillis / 1000}
            isPlaying={playbackStatus.playing}
            isLoaded={playbackStatus.isLoaded}
            isBuffering={playbackStatus.isBuffering || playbackRequestState === 'loading'}
            hasError={playbackRequestState === 'failed'}
            targetSeconds={playbackTargetSeconds}
            onToggle={togglePlayback}
            onSeek={(seconds) => { void seekPlayback(seconds, false); }}
          />
        ) : null}

        {importNotice ? (
          <Pressable
            style={[
              styles.importNoticeBanner,
              isNestedScreen && styles.ocrTaskBannerNested,
              showPersistentReviewPlayer && styles.floatingBannerAbovePlayer,
            ]}
            onPress={() => setImportNotice('')}
          >
            <View style={styles.importNoticeIcon}>
              <AppIcon name="check" size={17} color="#047857" />
            </View>
            <Text style={styles.importNoticeText} numberOfLines={2}>{importNotice}</Text>
          </Pressable>
        ) : null}

        {!importNotice && activeTab !== 'home' && (ocrProgress || screenshotDrafts.length || ocrError) ? (
          <Pressable
            style={[
              styles.ocrTaskBanner,
              isNestedScreen && styles.ocrTaskBannerNested,
              showPersistentReviewPlayer && styles.floatingBannerAbovePlayer,
              ocrError && styles.ocrTaskBannerError,
            ]}
            onPress={() => {
              if (ocrProgress) {
                Alert.alert('取消截图识别？', '已经完成的识别结果尚未进入核对页，取消后需要重新选择截图。', [
                  { text: '继续识别', style: 'cancel' },
                  { text: '取消任务', style: 'destructive', onPress: () => ocrAbortControllerRef.current?.abort() },
                ]);
                return;
              }
              if (screenshotDrafts.length) {
                setShowScreenshotDrafts(true);
                return;
              }
              if (ocrError) {
                Alert.alert('截图识别失败', ocrError, [
                  { text: '关闭', onPress: () => setOcrError('') },
                ]);
              }
            }}
          >
            <View style={[styles.ocrTaskIcon, ocrError && styles.ocrTaskIconError]}>
              <AppIcon name={ocrProgress ? 'import' : ocrError ? 'close' : 'check'} size={18} color={ocrError ? '#9F4E45' : '#26423A'} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.ocrTaskTitle} numberOfLines={1}>
                {ocrProgress ? '正在识别招聘截图' : ocrError ? '截图识别未完成' : `识别完成 · ${screenshotDrafts.length} 条待核对`}
              </Text>
              <Text style={styles.ocrTaskDetail} numberOfLines={1}>
                {ocrProgress ? `${ocrProgress.completed}/${ocrProgress.total} · 可以继续使用其他功能` : ocrError ? '点击查看原因' : '点击核对并导入'}
              </Text>
            </View>
            <AppIcon name={ocrProgress ? 'close' : 'chevron'} size={18} color="#7B8580" />
          </Pressable>
        ) : null}

        {!isNestedScreen ? (
          <View style={styles.tabBar}>
            <TabButton id="home" activeTab={activeTab} label="首页" icon="home" onPress={setActiveTab} />
            <TabButton id="jobs" activeTab={activeTab} label="职位" icon="jobs" onPress={setActiveTab} />
            <TabButton id="interviews" activeTab={activeTab} label="面试" icon="interviews" onPress={setActiveTab} />
            <TabButton id="me" activeTab={activeTab} label="我的" icon="profile" onPress={setActiveTab} />
          </View>
        ) : null}
      </View>

      <MockInterviewScreen
        visible={showMockInterview}
        jobs={jobs}
        sessions={mockInterviewSessions}
        aiSettings={aiServiceSettings}
        apiKey={aiApiKey}
        tencentCredentials={tencentAsrCredentials}
        onUpsertSession={(session) => {
          setMockInterviewSessions((current) => [
            session,
            ...current.filter((item) => item.id !== session.id),
          ]);
        }}
        onClose={() => setShowMockInterview(false)}
      />

      <HrDemoScreen
        visible={showHrDemo}
        topInset={insets.top + 4}
        bottomInset={insets.bottom}
        onClose={() => setShowHrDemo(false)}
      />

      <ComplianceModal
        visible={showCompliance}
        onCancel={() => setShowCompliance(false)}
        onConfirm={confirmRecordingCompliance}
      />
      <NewInterviewModal
        visible={showNewInterview}
        jobs={jobs}
        selectedJobId={newInterviewJobId}
        values={{ company: newCompany, title: newTitle, round: newRound, startsAt: newStartsAt, type: newType }}
        onSelectJob={(job) => {
          setNewInterviewJobId(newInterviewJobId === job.id ? null : job.id);
          setNewCompany(job.company);
          setNewTitle(job.title);
        }}
        onChangeCompany={setNewCompany}
        onChangeTitle={setNewTitle}
        onChangeRound={setNewRound}
        onChangeStartsAt={setNewStartsAt}
        onChangeType={setNewType}
        onCancel={() => {
          setShowNewInterview(false);
          setNextRoundSourceInterviewId(null);
        }}
        onSave={createInterview}
      />
      <NewJobModal
        visible={showNewJob}
        values={{
          company: newJobCompany,
          title: newJobTitle,
          platform: newJobPlatform,
          city: newJobCity,
          salary: newJobSalary,
          tags: newJobTags,
          resume: newJobResume,
        }}
        onChangeCompany={setNewJobCompany}
        onChangeTitle={setNewJobTitle}
        onChangePlatform={setNewJobPlatform}
        onChangeCity={setNewJobCity}
        onChangeSalary={setNewJobSalary}
        onChangeTags={setNewJobTags}
        resumeVersions={resumeVersions}
        onChangeResume={setNewJobResume}
        importedFrom={pendingScreenshotName ? pendingScreenshotNote.applicationSource || '招聘截图' : ''}
        onCancel={() => {
          setPendingScreenshotName('');
          setPendingScreenshotNote({});
          setPendingJobStatus(null);
          setShowNewJob(false);
        }}
        onSave={createJob}
      />
      <EndReasonModal
        visible={Boolean(endingJob)}
        job={endingJob}
        onCancel={() => setEndingJob(null)}
        onConfirm={confirmEndJob}
      />
      <JobFiltersModal
        visible={showJobFilters}
        jobs={activeJobs}
        values={{ platform: jobPlatformFilter, city: jobCityFilter, resume: jobResumeFilter }}
        dateBasis={jobDateBasis}
        dateRange={jobDateRange}
        onChangePlatform={setJobPlatformFilter}
        onChangeCity={setJobCityFilter}
        onChangeResume={setJobResumeFilter}
        onChangeDateBasis={setJobDateBasis}
        onChangeDateRange={setJobDateRange}
        onReset={() => {
          setJobPlatformFilter('all');
          setJobCityFilter('all');
          setJobResumeFilter('all');
          setJobDateBasis('activity');
          setJobDateRange({ ...defaultDateRange, preset: 'all' });
        }}
        onClose={() => setShowJobFilters(false)}
      />
      <BatchResearchModal
        visible={showBatchResearch}
        jobs={filteredJobs}
        selectedIds={batchResearchSelectedIds}
        progress={batchResearchProgress}
        onToggle={(jobId) => setBatchResearchSelectedIds((current) => current.includes(jobId)
          ? current.filter((id) => id !== jobId)
          : [...current, jobId])}
        onSelectAll={() => setBatchResearchSelectedIds(filteredJobs.map((job) => job.id))}
        onClear={() => setBatchResearchSelectedIds([])}
        onStart={() => void runBatchJobResearch()}
        onCancel={() => researchAbortControllerRef.current?.abort()}
        onClose={() => setShowBatchResearch(false)}
      />
      <ScreenshotDraftsModal
        visible={showScreenshotDrafts}
        drafts={screenshotDrafts}
        selectedIds={selectedScreenshotDraftIds}
        progress={ocrProgress}
        onToggle={(id) =>
          setSelectedScreenshotDraftIds((current) =>
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
          )
        }
        onSelectAll={() => setSelectedScreenshotDraftIds(screenshotDrafts.map((draft) => draft.id))}
        onClearSelection={() => setSelectedScreenshotDraftIds([])}
        onToggleDuplicateAction={(id) => setScreenshotDrafts((current) => current.map((draft) =>
          draft.id === id ? { ...draft, duplicateAction: draft.duplicateAction === 'create' ? 'merge' : 'create' } : draft,
        ))}
        onDismiss={() => {
          setShowScreenshotDrafts(false);
        }}
        onDiscard={() => {
          setShowScreenshotDrafts(false);
          setScreenshotDrafts([]);
          setSelectedScreenshotDraftIds([]);
          setOcrProgress(null);
          setOcrError('');
        }}
        onSave={saveScreenshotDrafts}
      />
      <HomeMetricDetailModal
        visible={Boolean(homeMetricDetail)}
        metricKey={homeMetricDetail}
        jobs={homeJobs}
        interviews={homeInterviews}
        onClose={() => setHomeMetricDetail(null)}
      />
      <NewResumeModal
        visible={showNewResume}
        editing={editingResumeId !== null}
        values={{ name: newResumeName, targetRole: newResumeTarget, keywords: newResumeKeywords, fileName: newResumeFileName, content: newResumeContent }}
        onChangeName={setNewResumeName}
        onChangeTargetRole={setNewResumeTarget}
        onChangeKeywords={setNewResumeKeywords}
        onChangeContent={setNewResumeContent}
        onPickFile={pickResumeFile}
        onCancel={() => {
          setShowNewResume(false);
          setEditingResumeId(null);
        }}
        onSave={createResumeVersion}
      />
    </View>
  );
}

function Header({
  activeTab,
  onCreateJob,
  onCreateInterview,
  onImportScreenshot,
}: {
  activeTab: TabId;
  onCreateJob: () => void;
  onCreateInterview: () => void;
  onImportScreenshot: () => void;
}) {
  const { isCompact } = useResponsiveLayout();
  const handlePress = activeTab === 'home' ? onImportScreenshot : activeTab === 'jobs' ? onCreateJob : onCreateInterview;
  const actionLabel = activeTab === 'home' ? '截图批量导入' : activeTab === 'jobs' ? '新增职位' : '新增面试';
  const actionIcon = activeTab === 'home' ? 'import' : 'add';

  return (
    <View style={[styles.header, isCompact && styles.headerCompact]}>
      <Text style={[styles.largeTitle, isCompact && styles.largeTitleCompact]}>{getScreenTitle(activeTab)}</Text>
      {activeTab !== 'me' ? (
        <View style={styles.headerActions}>
          {activeTab === 'interviews' ? (
            <Pressable style={styles.addButton} onPress={onImportScreenshot} accessibilityRole="button" accessibilityLabel="识别面试截图">
              <AppIcon name="import" size={21} color="#2B3935" />
            </Pressable>
          ) : null}
          <Pressable style={styles.addButton} onPress={handlePress} accessibilityRole="button" accessibilityLabel={actionLabel}>
            <AppIcon name={actionIcon} size={22} color="#2B3935" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function NavigationBar({
  title,
  onBack,
  actionLabel,
  onAction,
  fixed = false,
}: {
  title: string;
  onBack: () => void;
  actionLabel?: string;
  onAction?: () => void;
  fixed?: boolean;
}) {
  const { isCompact } = useResponsiveLayout();
  return (
    <View style={[styles.navigationBar, fixed && styles.navigationBarFixed]}>
      <Pressable style={[styles.navigationSide, isCompact && styles.navigationSideCompact]} onPress={onBack} accessibilityRole="button" accessibilityLabel="返回">
        <AppIcon name="back" size={25} color="#2B3935" />
      </Pressable>
      <Text style={[styles.navigationTitle, isCompact && styles.navigationTitleCompact]} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
      <View style={[styles.navigationSide, isCompact && styles.navigationSideCompact]}>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
            <Text style={styles.navigationAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function HomeDashboard({
  section,
  insightSection,
  upcomingInterviews,
  metrics,
  jobs,
  jobNotes,
  interviews,
  interviewChecklistDone,
  interviewDrafts,
  interviewResults,
  ocrProgress,
  pendingOcrCount,
  ocrError,
  batchResearchProgress,
  dateRange,
  onSectionChange,
  onDateRangeChange,
  onInsightSectionChange,
  onMetricPress,
  onOpenInterviewPrepare,
  onOpenJobTask,
  onOpenInterviewTask,
  onOpenOcrTask,
  onOpenResearchTask,
}: {
  section: HomeSection;
  insightSection: HomeInsightSection;
  upcomingInterviews: Interview[];
  metrics: ReturnType<typeof calculateMetrics>;
  jobs: Job[];
  jobNotes: Record<number, JobNote>;
  interviews: Interview[];
  interviewChecklistDone: Record<number, Record<string, boolean>>;
  interviewDrafts: Record<number, InterviewDraft>;
  interviewResults: Record<number, InterviewResult>;
  ocrProgress: { completed: number; total: number } | null;
  pendingOcrCount: number;
  ocrError: string;
  batchResearchProgress: BatchResearchProgress;
  dateRange: DateRangeValue;
  onSectionChange: (section: HomeSection) => void;
  onDateRangeChange: (value: DateRangeValue) => void;
  onInsightSectionChange: (section: HomeInsightSection) => void;
  onMetricPress: (metric: HomeMetricKey) => void;
  onOpenInterviewPrepare: (interviewId: number) => void;
  onOpenJobTask: (jobId: number, section: JobDetailSection) => void;
  onOpenInterviewTask: (interviewId: number, section: InterviewDetailSection) => void;
  onOpenOcrTask: () => void;
  onOpenResearchTask: () => void;
}) {
  const { width } = useWindowDimensions();
  const todos = buildHomeTodos(jobs, jobNotes, interviews, interviewDrafts, interviewResults);
  const platformRows = buildDimensionRows(jobs, (job) => job.platform);
  const cityRows = buildDimensionRows(jobs, (job) => normalizeCityLabel(job.city));
  const resumeRows = buildDimensionRows(jobs, (job) => job.resume);
  const directionRows = buildDimensionRows(jobs, (job) => jobNotes[job.id]?.direction || '未填写方向');
  const companySizeRows = buildDimensionRows(jobs, (job) => jobNotes[job.id]?.companySize || '未填写规模');
  const endReasonRows = buildEndReasonRows(jobs, jobNotes);
  const suggestions = buildStrategySuggestions(jobs, interviews, interviewDrafts, interviewResults);
  const processingTasks: Array<{
    id: string;
    icon: 'import' | 'globe' | 'interviews' | 'sparkles';
    title: string;
    detail: string;
    tone: 'active' | 'attention' | 'ready';
    onPress: () => void;
  }> = [];

  if (ocrProgress) {
    processingTasks.push({
      id: 'ocr-processing',
      icon: 'import',
      title: '正在识别招聘截图',
      detail: `${ocrProgress.completed}/${ocrProgress.total} · 完成后等待核对`,
      tone: 'active',
      onPress: onOpenOcrTask,
    });
  } else if (pendingOcrCount) {
    processingTasks.push({
      id: 'ocr-ready',
      icon: 'import',
      title: `${pendingOcrCount} 条识别结果待核对`,
      detail: '确认岗位与面试信息后再导入',
      tone: 'ready',
      onPress: onOpenOcrTask,
    });
  } else if (ocrError) {
    processingTasks.push({
      id: 'ocr-failed',
      icon: 'import',
      title: '截图识别未完成',
      detail: '点击查看失败原因',
      tone: 'attention',
      onPress: onOpenOcrTask,
    });
  }

  if (batchResearchProgress.status === 'running') {
    processingTasks.push({
      id: 'research-processing',
      icon: 'globe',
      title: `正在调研 ${batchResearchProgress.completedJobs}/${batchResearchProgress.totalJobs}`,
      detail: batchResearchProgress.detail || '正在整理公开信息',
      tone: 'active',
      onPress: onOpenResearchTask,
    });
  }

  interviews.forEach((interview) => {
    const draft = interviewDrafts[interview.id];
    if (!draft) return;
    if (draft.transcriptionState === 'processing' || draft.transcriptionState === 'failed') {
      processingTasks.push({
        id: `transcription-${interview.id}`,
        icon: 'interviews',
        title: `${interview.company} · ${draft.transcriptionState === 'processing' ? '正在转写' : '转写已中断'}`,
        detail: formatTranscriptionTaskStatus(draft),
        tone: draft.transcriptionState === 'processing' ? 'active' : 'attention',
        onPress: () => onOpenInterviewTask(interview.id, 'record'),
      });
    }
    if (draft.reviewGenerationState === 'processing' || draft.reviewGenerationState === 'failed') {
      processingTasks.push({
        id: `review-${interview.id}`,
        icon: 'sparkles',
        title: `${interview.company} · ${draft.reviewGenerationState === 'processing' ? '正在生成复盘' : '复盘未完成'}`,
        detail: draft.reviewGenerationState === 'processing' ? '已有结果会自动保存' : '点击查看并重试',
        tone: draft.reviewGenerationState === 'processing' ? 'active' : 'attention',
        onPress: () => onOpenInterviewTask(interview.id, 'review'),
      });
    }
    if (draft.transcriptOrganizationState === 'processing' || draft.transcriptOrganizationState === 'failed') {
      const organizing = draft.transcriptOrganizationState === 'processing';
      processingTasks.push({
        id: `organization-${interview.id}`,
        icon: 'sparkles',
        title: `${interview.company} · ${organizing ? '正在整理对话' : '对话整理未完成'}`,
        detail: organizing
          ? draft.transcriptOrganizationTotalChunks
            ? `已完成 ${draft.transcriptOrganizationCompletedChunks}/${draft.transcriptOrganizationTotalChunks} 段，结果逐段保存`
            : '正在准备分段，结果会逐段保存'
          : draft.transcriptOrganizationError || '点击查看原因并决定是否继续',
        tone: organizing ? 'active' : 'attention',
        onPress: () => onOpenInterviewTask(interview.id, 'review'),
      });
    }
  });
  const todayCardWidth = Math.max(292, width - 44);
  const funnelStages: Array<{
    metric: HomeMetricKey;
    label: string;
    value: number;
    rate?: number;
  }> = [
    { metric: 'applied', label: '已投递', value: metrics.applied },
    { metric: 'replyRate', label: '有回复', value: metrics.responded, rate: metrics.replyRate },
    {
      metric: 'interviewRate',
      label: '进入面试',
      value: metrics.interviewCount,
      rate: metrics.interviewRate,
    },
    { metric: 'offerRate', label: 'Offer', value: metrics.offered, rate: metrics.offerRate },
  ];

  return (
    <>
      <Section>
        {upcomingInterviews.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroller}>
            {upcomingInterviews.map((interview, index) => {
              const done = Object.values(interviewChecklistDone[interview.id] ?? {}).filter(Boolean).length;
              return (
                <Pressable
                  key={interview.id}
                  style={[styles.todayInterviewCard, index === 0 && styles.todayInterviewCardPrimary, { width: todayCardWidth }]}
                  onPress={() => onOpenInterviewPrepare(interview.id)}
                >
                  <View style={styles.interviewCardTopRow}>
                    <View style={styles.interviewCardEyebrow}>
                      <AppIcon name="calendar" size={16} color="#2B3935" />
                      <Text style={styles.interviewTime}>{index === 0 ? '下一场面试' : '后续面试'}</Text>
                    </View>
                    <Text style={styles.interviewCountdown}>{formatInterviewCountdown(interview.startsAt, interview.id)}</Text>
                  </View>
                  <View style={styles.interviewCardMain}>
                    <Text style={styles.interviewCompany} numberOfLines={1} ellipsizeMode="tail">{interview.company}</Text>
                    <Text style={styles.interviewRole} numberOfLines={2}>{interview.title}</Text>
                    <Text style={styles.interviewMeta} numberOfLines={1} ellipsizeMode="tail">{formatInterviewSchedule(interview.startsAt, interview.id)} · {interview.round} · {interview.type}</Text>
                  </View>
                  <View style={styles.interviewCardFooter}>
                    <View style={styles.interviewProgressTrack}>
                      <View style={[styles.interviewProgressFill, { width: `${interview.checklist.length ? (done / interview.checklist.length) * 100 : 0}%` }]} />
                    </View>
                    <Text style={styles.interviewProgress}>准备 {done}/{interview.checklist.length}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <FeatureCard
            icon="calendar"
            eyebrow="近期安排"
            title="没有待开始的面试"
            detail="新增面试后会在这里显示下一场安排"
          />
        )}
      </Section>
      {processingTasks.length ? (
        <View style={styles.processingPanel}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.groupTitle}>处理中</Text>
            <Text style={styles.sectionMeta}>{processingTasks.length} 项</Text>
          </View>
          <View style={styles.processingTaskList}>
            {processingTasks.slice(0, 4).map((task) => (
              <Pressable key={task.id} style={styles.processingTaskRow} onPress={task.onPress}>
                <View style={[
                  styles.processingTaskIcon,
                  task.tone === 'active' && styles.processingTaskIconActive,
                  task.tone === 'attention' && styles.processingTaskIconAttention,
                ]}>
                  <AppIcon name={task.icon} size={17} color={task.tone === 'attention' ? '#9F4E45' : task.tone === 'active' ? '#6D55A3' : '#356451'} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.processingTaskTitle} numberOfLines={1} ellipsizeMode="tail">{task.title}</Text>
                  <Text style={styles.processingTaskDetail} numberOfLines={1} ellipsizeMode="tail">{task.detail}</Text>
                </View>
                <AppIcon name="chevron" size={17} color="#9CA3AF" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <SegmentedTabs
        value={section}
        options={[
          { value: 'todo', label: '待办' },
          { value: 'funnel', label: '漏斗' },
          { value: 'insight', label: '分析' },
        ]}
        onChange={onSectionChange}
      />
      {section !== 'todo' ? (
        <View style={styles.compactFilterBlock}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.metricLabel}>按投递日期</Text>
            <Text style={styles.sectionMeta}>{jobs.length} 个职位</Text>
          </View>
          <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
        </View>
      ) : null}
      {section === 'todo' && (
        <Section title="今天要做" meta={`${todos.length} 项`} variant="list">
          {todos.length ? (
            todos.slice(0, 4).map((todo, index) => (
              <ActionRow
                key={todo.id}
                title={todo.title}
                detail={todo.detail}
                last={index === Math.min(todos.length, 4) - 1}
                trailing={<View style={styles.todoActionButton}><Text style={styles.todoAction} numberOfLines={1}>{todo.actionLabel}</Text></View>}
                onPress={() => {
                  if (todo.target.type === 'job') {
                    onOpenJobTask(todo.target.id, todo.target.section);
                    return;
                  }
                  onOpenInterviewTask(todo.target.id, todo.target.section);
                }}
              />
            ))
          ) : (
            <CompactEmptyState title="今天没有待处理事项" detail="新的面试、反馈和转写任务会出现在这里" />
          )}
        </Section>
      )}
      {section === 'funnel' && (
        <Section title="投递漏斗" meta="当前范围">
            <View style={styles.funnelGrid}>
              {funnelStages.map((stage, index) => (
                <View key={stage.metric} style={styles.funnelGridItemWrap}>
                  <Pressable style={styles.funnelGridItem} onPress={() => onMetricPress(stage.metric)}>
                    <Text style={styles.funnelStageLabel}>{stage.label}</Text>
                    <View style={styles.funnelValueLine}>
                      <Text style={styles.funnelStageValue}>{stage.value}</Text>
                      {stage.rate !== undefined ? <Text style={[styles.funnelRate, stage.rate > 0 && styles.funnelRatePositive]}>{stage.rate}%</Text> : null}
                    </View>
                  </Pressable>
                </View>
              ))}
              <View style={styles.funnelGridItemWrap}>
                <View style={styles.funnelGridItem}>
                  <Text style={styles.funnelStageLabel}>已结束</Text>
                  <View style={styles.funnelValueLine}>
                    <Text style={styles.funnelStageValue}>{metrics.ended}</Text>
                  </View>
                </View>
              </View>
            </View>
        </Section>
      )}
      {section === 'insight' && (
        <>
          <Section title="今日建议" variant="list">
            {suggestions.map((item) => (
              <ListRow key={item.title} title={item.title} detail={item.detail} />
            ))}
          </Section>
          <SegmentedTabs
            value={insightSection}
            options={[
              { value: 'channel', label: '渠道' },
              { value: 'resume', label: '简历' },
              { value: 'risk', label: '风险' },
            ]}
            onChange={onInsightSectionChange}
          />
          {insightSection === 'channel' && (
            <Section title="渠道与城市">
              <View style={styles.analysisColumns}>
                <AnalysisColumn title="渠道" rows={mergeDimensionRows(platformRows, normalizePlatformLabel).slice(0, 4)} total={jobs.length} />
                <AnalysisColumn title="城市" rows={cityRows.slice(0, 4)} total={jobs.length} />
              </View>
            </Section>
          )}
          {insightSection === 'resume' && (
            <Section title="简历与方向" variant="list">
              {resumeRows.slice(0, 3).map((row) => (
                <ListRow key={`resume-${row.label}`} title={row.label} detail={row.detail} />
              ))}
              {directionRows.slice(0, 2).map((row) => (
                <ListRow key={`direction-${row.label}`} title={row.label} detail={row.detail} />
              ))}
              {companySizeRows.slice(0, 2).map((row) => (
                <ListRow key={`size-${row.label}`} title={row.label} detail={row.detail} />
              ))}
            </Section>
          )}
          {insightSection === 'risk' && (
            <Section title="结束原因" variant="list">
              {endReasonRows.length ? (
                endReasonRows.slice(0, 5).map((row) => <ListRow key={row.label} title={row.label} detail={row.detail} />)
              ) : (
                <CompactEmptyState title="还没有已结束职位" />
              )}
            </Section>
          )}
        </>
      )}
    </>
  );
}

function HomeScreen({
  section,
  selectedInterview,
  metrics,
  jobs,
  jobNotes,
  interviews,
  interviewDrafts,
  interviewResults,
  onSectionChange,
  onOpenInterviews,
}: {
  section: HomeSection;
  selectedInterview: Interview;
  metrics: ReturnType<typeof calculateMetrics>;
  jobs: Job[];
  jobNotes: Record<number, JobNote>;
  interviews: Interview[];
  interviewDrafts: Record<number, InterviewDraft>;
  interviewResults: Record<number, InterviewResult>;
  onSectionChange: (section: HomeSection) => void;
  onOpenInterviews: () => void;
}) {
  const todos = buildHomeTodos(jobs, jobNotes, interviews, interviewDrafts, interviewResults);
  const platformRows = buildDimensionRows(jobs, (job) => job.platform);
  const cityRows = buildDimensionRows(jobs, (job) => normalizeCityLabel(job.city));
  const resumeRows = buildDimensionRows(jobs, (job) => job.resume);
  const endReasonRows = buildEndReasonRows(jobs, jobNotes);
  const suggestions = buildStrategySuggestions(jobs, interviews, interviewDrafts, interviewResults);

  return (
    <>
      <View style={styles.heroGroup}>
        <Text style={styles.kicker}>今日面试</Text>
        <Text style={styles.heroTitle}>
          {selectedInterview.company} · {selectedInterview.round}
        </Text>
        <Text style={styles.mutedText}>
          {formatInterviewSchedule(selectedInterview.startsAt, selectedInterview.id)} / {selectedInterview.type} / {selectedInterview.title}
        </Text>
        <Pressable style={styles.primaryButton} onPress={onOpenInterviews}>
          <Text style={styles.primaryButtonText}>进入面试准备</Text>
        </Pressable>
      </View>
      <AdaptiveGrid minItemWidth={150} gap={10}>
        <Metric label="投递" value={`${metrics.applied}`} />
        <Metric label="回复率" value={`${metrics.replyRate}%`} />
        <Metric label="面试率" value={`${metrics.interviewRate}%`} />
        <Metric label="Offer 率" value={`${metrics.offerRate}%`} />
      </AdaptiveGrid>
      <Group title="投递漏斗">
        <ListRow title="已投递" detail={`${metrics.applied} 个职位进入投递阶段`} />
        <ListRow title="有回复" detail={`${metrics.responded} 个职位收到回复 · ${metrics.replyRate}%`} />
        <ListRow title="面试中" detail={`${metrics.interviewCount} 个职位创建面试 · ${metrics.interviewRate}%`} />
        <ListRow title="已录用 / 已结束" detail={`${metrics.offered} 个 Offer · ${metrics.ended} 个结束`} />
      </Group>
      <Group title="渠道效果">
        {platformRows.map((row) => (
          <ListRow key={row.label} title={row.label} detail={row.detail} />
        ))}
      </Group>
      <Group title="城市与简历">
        {cityRows.slice(0, 3).map((row) => (
          <ListRow key={`city-${row.label}`} title={row.label} detail={row.detail} />
        ))}
        {resumeRows.slice(0, 3).map((row) => (
          <ListRow key={`resume-${row.label}`} title={row.label} detail={row.detail} />
        ))}
      </Group>
      <Group title="结束原因">
        {endReasonRows.length ? (
          endReasonRows.map((row) => <ListRow key={row.label} title={row.label} detail={row.detail} />)
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>还没有已结束职位。</Text>
          </View>
        )}
      </Group>
      <Group title="待处理">
        {todos.length ? (
          todos.map((todo) => <ListRow key={`${todo.title}-${todo.detail}`} title={todo.title} detail={todo.detail} />)
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>当前没有紧急待办。</Text>
          </View>
        )}
      </Group>
    </>
  );
}

function JobsScreen({
  jobs,
  jobNotes,
  jobEvents,
  interviews,
  interviewResults,
  search,
  statusFilter,
  dateBasis,
  dateRange,
  onSearchChange,
  onStatusFilterChange,
  onOpenFilters,
  onOpenBatchResearch,
  batchResearchProgress,
  selectedIds,
  onSelectedIdsChange,
  onSelectJob,
  onCycleStatus,
  onArchiveSelected,
  onDeleteSelected,
  onImportScreenshot,
}: {
  jobs: Job[];
  jobNotes: Record<number, JobNote>;
  jobEvents: Record<number, ApplicationEvent[]>;
  interviews: Interview[];
  interviewResults: Record<number, InterviewResult>;
  search: string;
  statusFilter: JobStatusFilter;
  dateBasis: JobDateBasis;
  dateRange: DateRangeValue;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (status: JobStatusFilter) => void;
  onOpenFilters: () => void;
  onOpenBatchResearch: () => void;
  batchResearchProgress: BatchResearchProgress;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  onSelectJob: (jobId: number) => void;
  onCycleStatus: (jobId: number, currentStatus: ApplicationStatus) => void;
  onArchiveSelected: (jobIds: number[]) => void;
  onDeleteSelected: (jobIds: number[]) => void;
  onImportScreenshot: () => void;
}) {
  const selectionMode = selectedIds.length > 0;
  const toggleSelected = (jobId: number) => onSelectedIdsChange(
    selectedIds.includes(jobId) ? selectedIds.filter((id) => id !== jobId) : [...selectedIds, jobId],
  );
  return (
    <>
      <View style={styles.searchToolbar}>
        <TextInput
          style={styles.searchInput}
          placeholderTextColor="#8A918D"
          value={search}
          onChangeText={onSearchChange}
          placeholder="搜索公司、岗位、城市"
        />
        <Pressable style={styles.searchToolButton} onPress={onOpenFilters} accessibilityRole="button" accessibilityLabel="筛选职位">
          <AppIcon name="filter" size={20} color="#4B5563" />
        </Pressable>
        <Pressable style={styles.searchToolButton} onPress={onImportScreenshot} accessibilityRole="button" accessibilityLabel="导入职位截图">
          <AppIcon name="import" size={20} color="#4B5563" />
        </Pressable>
        <Pressable style={styles.searchToolButton} onPress={onOpenBatchResearch} accessibilityRole="button" accessibilityLabel="批量调研职位">
          <AppIcon name="globe" size={20} color={batchResearchProgress.status === 'running' ? '#7C3AED' : '#4B5563'} />
        </Pressable>
      </View>
      {batchResearchProgress.status === 'running' ? (
        <Pressable style={styles.researchTaskBanner} onPress={onOpenBatchResearch}>
          <View style={styles.flexOne}>
            <Text style={styles.researchTaskTitle}>批量调研 {batchResearchProgress.completedJobs}/{batchResearchProgress.totalJobs}</Text>
            <Text style={styles.researchTaskDetail} numberOfLines={1}>{batchResearchProgress.detail}</Text>
          </View>
          <AppIcon name="chevron" size={17} color="#6D55A3" />
        </Pressable>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        <View style={styles.filterRow}>
          {jobStatusFilters.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              active={statusFilter === filter.value}
              onPress={() => onStatusFilterChange(filter.value)}
            />
          ))}
        </View>
      </ScrollView>
      {dateRange.preset !== 'all' ? (
        <Text style={styles.activeFilterText}>{jobDateBasisLabel(dateBasis)} · {dateRangeLabel(dateRange)}</Text>
      ) : null}
      {selectionMode ? (
        <View style={styles.batchActionBar}>
          <Text style={styles.batchActionCount}>已选 {selectedIds.length}</Text>
          <Pressable style={styles.batchActionButton} onPress={() => onSelectedIdsChange(selectedIds.length === jobs.length ? [] : jobs.map((job) => job.id))}>
            <Text style={styles.batchActionText}>{selectedIds.length === jobs.length ? '取消全选' : '全选'}</Text>
          </Pressable>
          <Pressable style={styles.batchActionButton} onPress={() => onArchiveSelected(selectedIds)}><Text style={styles.batchActionText}>归档</Text></Pressable>
          <Pressable style={styles.batchDangerButton} onPress={() => onDeleteSelected(selectedIds)}><Text style={styles.batchDangerText}>删除</Text></Pressable>
          <Pressable style={styles.batchCloseButton} accessibilityLabel="退出多选" onPress={() => onSelectedIdsChange([])}><AppIcon name="close" size={19} color="#6B7280" /></Pressable>
        </View>
      ) : null}
      <Group title="职位进度">
        {jobs.length ? jobs.map((job) => {
          const linkedInterviews = interviews.filter((interview) => interview.jobId === job.id);
          const nextInterview = linkedInterviews[0];
          const secondaryDetail = nextInterview
            ? `${nextInterview.round} · ${formatInterviewSchedule(nextInterview.startsAt, nextInterview.id)}`
            : jobNotes[job.id]?.nextAction || [job.city, job.salary].filter(Boolean).join(' · ');
          return (
            <Pressable
              style={[styles.jobRow, selectedIds.includes(job.id) && styles.selectableRowActive]}
              key={job.id}
              onPress={() => selectionMode ? toggleSelected(job.id) : onSelectJob(job.id)}
              onLongPress={() => toggleSelected(job.id)}
              delayLongPress={320}
            >
              <View style={styles.jobRowHeader}>
                {selectionMode ? <View style={[styles.selectionBox, selectedIds.includes(job.id) && styles.selectionBoxActive]}>{selectedIds.includes(job.id) ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}</View> : null}
                <View style={styles.flexOne}>
                  <Text style={styles.rowTitle}>{job.company}</Text>
                  <Text style={styles.rowDetail} numberOfLines={1} ellipsizeMode="tail">{job.title}</Text>
                </View>
                <StatusPill status={job.status} />
                <AppIcon name="chevron" size={18} color="#9CA3AF" />
              </View>
              {secondaryDetail ? <Text style={styles.jobListFocus} numberOfLines={1} ellipsizeMode="tail">{secondaryDetail}</Text> : null}
            </Pressable>
          );
        }) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>没有匹配的职位。</Text>
          </View>
        )}
      </Group>
    </>
  );
}

function JobDetailWorkspace({
  section,
  job,
  note,
  events,
  linkedInterviews,
  interviewResults,
  resumeVersions,
  hrAnswerRecords,
  hrAnswerBusy,
  researchApiKey,
  researchItems,
  aiSettings,
  aiApiKey,
  isEditing,
  onEdit,
  onSectionChange,
  onBack,
  onCycleStatus,
  onCreateInterview,
  onUpdateJob,
  onUpdateJobNote,
  onBindResume,
  onOpenInterview,
  onGenerateHrAnswer,
  onDeleteHrAnswer,
  onOpenResumeEditor,
  onOpenAiSettings,
  isArchived,
  onToggleArchive,
  onSaveResearchItem,
  onDelete,
}: {
  section: JobDetailSection;
  job: Job;
  note: JobNote;
  events: ApplicationEvent[];
  linkedInterviews: Interview[];
  interviewResults: Record<number, InterviewResult>;
  resumeVersions: ResumeVersion[];
  hrAnswerRecords: HrAnswerRecord[];
  hrAnswerBusy: boolean;
  researchApiKey: string;
  researchItems: JobResearchItem[];
  aiSettings: AiServiceSettings;
  aiApiKey: string;
  isEditing: boolean;
  onEdit: () => void;
  onSectionChange: (section: JobDetailSection) => void;
  onBack: () => void;
  onCycleStatus: (jobId: number, currentStatus: ApplicationStatus) => void;
  onCreateInterview: (job: Job) => void;
  onUpdateJob: (jobId: number, patch: Partial<Job>) => void;
  onUpdateJobNote: (jobId: number, patch: Partial<JobNote>) => void;
  onBindResume: (resumeName: string) => void;
  onOpenInterview: (interviewId: number, section: InterviewDetailSection) => void;
  onGenerateHrAnswer: (question: string) => void;
  onDeleteHrAnswer: (recordId: string) => void;
  onOpenResumeEditor: (resume: ResumeVersion | null) => void;
  onOpenAiSettings: () => void;
  isArchived: boolean;
  onToggleArchive: () => void;
  onSaveResearchItem: (item: JobResearchItem) => void;
  onDelete: (job: Job) => void;
}) {
  const offerSummary = buildOfferDecisionSummary(job, note);
  const [showJobSettings, setShowJobSettings] = useState(false);
  const [openEditSections, setOpenEditSections] = useState<Record<string, boolean>>({ basic: true });
  const [showApplicationDatePicker, setShowApplicationDatePicker] = useState(false);
  const [hrQuestion, setHrQuestion] = useState('');
  const intentScore = note.intentScore.trim();
  const displayedIntentScore = intentScore && !/^[-_]+$/.test(intentScore) ? intentScore : '未设置';

  useEffect(() => {
    setShowJobSettings(false);
    setHrQuestion('');
  }, [job.id]);

  if (isEditing) {
    return (
      <>
        <View style={styles.formPage}>
          <CollapsibleFormSection title="基础信息" open={Boolean(openEditSections.basic)} onToggle={() => setOpenEditSections((current) => ({ ...current, basic: !current.basic }))}>
          <FormInput label="公司" value={job.company} onChangeText={(value) => onUpdateJob(job.id, { company: value })} placeholder="公司名称" />
          <FormInput label="岗位" value={job.title} onChangeText={(value) => onUpdateJob(job.id, { title: value })} placeholder="岗位名称" />
          <FormChoice label="平台" value={job.platform} options={[job.platform, 'Boss直聘', '官网', '猎聘', '拉勾']} onSelect={(value) => onUpdateJob(job.id, { platform: value })} />
          <FormChoice label="城市" value={job.city} options={[job.city, '长沙', '广州', '深圳', '杭州', '远程']} onSelect={(value) => onUpdateJob(job.id, { city: value })} />
          <FormInput label="薪资" value={job.salary} onChangeText={(value) => onUpdateJob(job.id, { salary: value })} placeholder="例如：18-28K" />
          <Text style={styles.formLabel}>使用简历</Text>
          <View style={styles.filterRowWrap}>
            {resumeVersions.map((resume) => (
              <FilterChip key={resume.id} label={resume.name} active={job.resume === resume.name} onPress={() => onBindResume(resume.name)} />
            ))}
          </View>
          </CollapsibleFormSection>

          <CollapsibleFormSection title="推进与备注" open={Boolean(openEditSections.progress)} onToggle={() => setOpenEditSections((current) => ({ ...current, progress: !current.progress }))}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>实际投递日期</Text>
            <Pressable style={styles.formPickerButton} onPress={() => setShowApplicationDatePicker(true)}>
              <Text style={note.applicationDate ? styles.formPickerValue : styles.formPickerPlaceholder}>{note.applicationDate || '日期待确认'}</Text>
              <AppIcon name="chevron" size={17} color="#9CA3AF" />
            </Pressable>
          </View>
          <FormInput label="下一步" value={note.nextAction} onChangeText={(value) => onUpdateJobNote(job.id, { nextAction: value })} placeholder="例如：周五跟进 HR" />
          <FormInput label="意向程度" value={note.intentScore} onChangeText={(value) => onUpdateJobNote(job.id, { intentScore: value })} placeholder="1-5 分" />
          <View style={styles.formField}>
            <Text style={styles.formLabel}>跟进备注</Text>
            <TextInput multiline style={styles.longNoteArea} textAlignVertical="top" value={note.note} onChangeText={(value) => onUpdateJobNote(job.id, { note: value })} placeholder="沟通信息、风险和面试线索" />
          </View>
          </CollapsibleFormSection>

          <CollapsibleFormSection title="岗位内容" open={Boolean(openEditSections.detail)} onToggle={() => setOpenEditSections((current) => ({ ...current, detail: !current.detail }))}>
          <FormInput label="岗位链接" value={note.jobUrl} onChangeText={(value) => onUpdateJobNote(job.id, { jobUrl: value })} placeholder="招聘平台或官网链接" />
          <FormInput label="关键词" value={job.tags.join(', ')} onChangeText={(value) => onUpdateJob(job.id, { tags: splitTags(value) })} placeholder="RAG, Agent, 交付" />
          <ResponsiveRow>
            <View style={styles.flexOne}><FormInput label="岗位方向" value={note.direction} onChangeText={(value) => onUpdateJobNote(job.id, { direction: value })} placeholder="AI / 后端" /></View>
            <View style={styles.flexOne}><FormInput label="经验要求" value={note.experience} onChangeText={(value) => onUpdateJobNote(job.id, { experience: value })} placeholder="例如：1-3 年" /></View>
          </ResponsiveRow>
          <ResponsiveRow>
            <View style={styles.flexOne}><FormInput label="工作方式" value={note.workMode} onChangeText={(value) => onUpdateJobNote(job.id, { workMode: value })} placeholder="现场 / 混合" /></View>
            <View style={styles.flexOne}><FormInput label="学历要求" value={note.education} onChangeText={(value) => onUpdateJobNote(job.id, { education: value })} placeholder="本科 / 不限" /></View>
          </ResponsiveRow>
          <FormInput label="JD 摘要" value={note.jdSummary} onChangeText={(value) => onUpdateJobNote(job.id, { jdSummary: value })} placeholder="职责、硬性要求和加分项" />
          </CollapsibleFormSection>

          {job.status === 'offered' ? (
          <CollapsibleFormSection title="Offer 信息" open={Boolean(openEditSections.offer)} onToggle={() => setOpenEditSections((current) => ({ ...current, offer: !current.offer }))}>
          <ResponsiveRow>
            <View style={styles.flexOne}><FormInput label="月薪 / Base" value={note.offerBaseSalary} onChangeText={(value) => onUpdateJobNote(job.id, { offerBaseSalary: value })} placeholder="例如：25K" /></View>
            <View style={styles.flexOne}><FormInput label="奖金 / 年终" value={note.offerBonus} onChangeText={(value) => onUpdateJobNote(job.id, { offerBonus: value })} placeholder="例如：14薪" /></View>
          </ResponsiveRow>
          <FormInput label="预估总包" value={note.offerTotalPackage} onChangeText={(value) => onUpdateJobNote(job.id, { offerTotalPackage: value })} placeholder="例如：35W" />
          <ResponsiveRow>
            <View style={styles.flexOne}><FormInput label="试用期" value={note.offerProbation} onChangeText={(value) => onUpdateJobNote(job.id, { offerProbation: value })} placeholder="3个月 100%" /></View>
            <View style={styles.flexOne}><FormInput label="入职时间" value={note.offerStartDate} onChangeText={(value) => onUpdateJobNote(job.id, { offerStartDate: value })} placeholder="可谈" /></View>
          </ResponsiveRow>
          <FormInput label="福利补充" value={note.offerBenefits} onChangeText={(value) => onUpdateJobNote(job.id, { offerBenefits: value })} placeholder="社保、公积金、远程等" />
          <FormInput label="主要风险" value={note.offerRisks} onChangeText={(value) => onUpdateJobNote(job.id, { offerRisks: value })} placeholder="业务、薪资结构、地点等" />
          <FormInput label="谈薪动作" value={note.offerNegotiation} onChangeText={(value) => onUpdateJobNote(job.id, { offerNegotiation: value })} placeholder="理由、底线和对方回复" />
          <FormInput label="决策结论" value={note.offerDecision} onChangeText={(value) => onUpdateJobNote(job.id, { offerDecision: value })} placeholder="接 / 拒 / 继续谈及原因" />
          </CollapsibleFormSection>
          ) : null}
        </View>
        {showApplicationDatePicker ? (
          <DateTimePicker
            value={parseRecordDate(note.applicationDate)}
            mode="date"
            onValueChange={(_event, value) => {
              onUpdateJobNote(job.id, { applicationDate: formatRecordDate(value) });
              setShowApplicationDatePicker(false);
            }}
            onDismiss={() => setShowApplicationDatePicker(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <View style={styles.detailSummary}>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.flexOne}>
            <Text style={styles.detailSubject}>{job.title}</Text>
            <Text style={styles.detailMetaLine}>{[job.salary, job.city].filter(Boolean).join(' · ') || '薪资与城市待补充'}</Text>
          </View>
          <StatusPill status={job.status} onPress={() => setShowJobSettings((value) => !value)} />
        </View>
        {note.direction || job.platform ? <Text style={styles.rowDetail}>{[note.direction, job.platform].filter(Boolean).join(' · ')}</Text> : null}
      </View>
      {showJobSettings ? (
        <View style={styles.interviewSettingsPanel}>
          <View style={styles.settingsStatusRow}>
            <View style={styles.flexOne}>
              <Text style={styles.formLabel}>当前状态</Text>
              <Text style={styles.rowTitle}>{statusMeta[job.status].label}</Text>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => onCycleStatus(job.id, job.status)}>
              <Text style={styles.secondaryButtonText}>推进状态</Text>
            </Pressable>
          </View>
          {job.tags.length ? <Text style={styles.rowDetail}>{job.tags.join(' · ')}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={() => onCreateInterview(job)}>
            <Text style={styles.primaryButtonText}>创建面试</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onToggleArchive}>
            <Text style={styles.secondaryButtonText}>{isArchived ? '恢复到当前职位' : '归档职位与关联面试'}</Text>
          </Pressable>
          <Pressable style={styles.settingsDeleteRow} onPress={() => onDelete(job)}>
            <Text style={styles.audioDeleteAction}>删除这个职位</Text>
            <AppIcon name="chevron" size={18} color="#9CA3AF" />
          </Pressable>
        </View>
      ) : null}
      <SegmentedTabs
        value={section}
        options={[
          { value: 'overview', label: '概览' },
          { value: 'jd', label: 'JD' },
          { value: 'chat', label: '助手' },
          { value: 'offer', label: 'Offer' },
          { value: 'timeline', label: '进度' },
        ]}
        onChange={onSectionChange}
      />
      {section === 'overview' && (
        <>
          <Group title="行动摘要">
            <View style={styles.sectionBody}>
              <Pressable style={styles.noticeBox} onPress={onEdit}>
                <AppIcon name="calendar" size={20} color="#84662F" />
                <View style={styles.flexOne}>
                  <Text style={styles.noticeTitle}>下一步</Text>
                  <Text style={styles.noticeText}>{note.nextAction || '点击添加下一步动作'}</Text>
                </View>
                <AppIcon name="chevron" size={17} color="#9CA3AF" />
              </Pressable>
              <View style={styles.intentPanel}>
                <Text style={styles.metricLabel}>意向程度</Text>
                <View style={styles.intentOptions}>
                  {['低', '中', '高'].map((value) => (
                    <Pressable
                      key={value}
                      style={[styles.intentOption, note.intentScore === value && styles.intentOptionActive]}
                      onPress={() => onUpdateJobNote(job.id, { intentScore: value })}
                    >
                      <Text style={[styles.intentOptionText, note.intentScore === value && styles.intentOptionTextActive]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </Group>
          <Group title={`关联面试 · ${linkedInterviews.length}`}>
            {linkedInterviews.length ? (
              linkedInterviews.map((interview) => {
                const result = interviewResults[interview.id] ?? '待反馈';
                const targetSection: InterviewDetailSection =
                  interview.status === '待复盘' || interview.audioState === '已录音' ? 'review' : result === '待反馈' ? 'followup' : 'prepare';
                return (
                  <ListRow
                    key={interview.id}
                    title={`${interview.round} · ${interview.type}`}
                    detail={`${formatInterviewSchedule(interview.startsAt, interview.id)} · ${interview.audioState} · ${result}`}
                    onPress={() => onOpenInterview(interview.id, targetSection)}
                  />
                );
              })
            ) : (
              <ListRow title="暂无关联面试" detail="点击创建并自动关联当前职位" onPress={() => onCreateInterview(job)} />
            )}
          </Group>
          <Group title="简历">
            <ListRow title={job.resume || '未绑定'} detail="在右上角编辑中切换版本" />
          </Group>
        </>
      )}
      {section === 'jd' && (
        <>
          <Group title="JD 速览">
            <View style={styles.sectionBody}>
              <View style={styles.readingCard}>
                <Text style={styles.readingTitle}>{note.direction || job.title}</Text>
                <HighlightedJdText text={formatJdSummaryForDisplay(note.jdSummary)} keywords={job.tags} />
              </View>
              <ResponsiveRow>
                <View style={styles.infoBox}>
                  <Text style={styles.metricLabel}>经验</Text>
                  <Text style={[styles.rowTitle, !note.experience && styles.infoValueUnset]}>{note.experience || '未设置'}</Text>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.metricLabel}>方式</Text>
                  <Text style={[styles.rowTitle, !note.workMode && styles.infoValueUnset]}>{note.workMode || '未设置'}</Text>
                </View>
              </ResponsiveRow>
            </View>
          </Group>
          {job.status === 'ended' ? <ListRow title="结束原因" detail={note.endReason || '未记录'} /> : null}
          {note.screenshotName ? (
            <Group title="截图来源">
              <View style={styles.sourceAttachment}>
                <AppIcon name="attachment" size={21} color="#6B7280" />
                <View style={styles.flexOne}>
                  <Text style={styles.rowTitle}>{formatScreenshotSource(note.applicationSource)}</Text>
                  <Text style={styles.rowDetail}>{[note.recordDate, note.recordTime, note.recruiterName].filter(Boolean).join(' · ') || '截图导入记录'}</Text>
                </View>
              </View>
            </Group>
          ) : null}
        </>
      )}
      {section === 'chat' && (
        <>
          <Group title="公司与岗位调研">
            <JobResearchPanel
              job={job}
              note={note}
              searchApiKey={researchApiKey}
              savedItems={researchItems}
              aiSettings={aiSettings}
              aiApiKey={aiApiKey}
              onOpenSettings={onOpenAiSettings}
              onSaveResearchItem={onSaveResearchItem}
              onSaveNote={(value) => onUpdateJobNote(job.id, { note: [note.note.trim(), value].filter(Boolean).join('\n\n') })}
            />
          </Group>
          <HrConversationPanel
            job={job}
            resume={resumeVersions.find((resume) => resume.name === job.resume) ?? null}
            question={hrQuestion}
            records={hrAnswerRecords}
            busy={hrAnswerBusy}
            onQuestionChange={setHrQuestion}
            onOpenResume={() => onOpenResumeEditor(resumeVersions.find((resume) => resume.name === job.resume) ?? null)}
            onGenerate={() => {
              if (!hrQuestion.trim()) {
                Alert.alert('问题为空', '请先输入 HR 的问题。');
                return;
              }
              onGenerateHrAnswer(hrQuestion);
            }}
            onDelete={onDeleteHrAnswer}
          />
        </>
      )}
      {section === 'offer' && (
        job.status === 'offered' ? <>
          <Group title="Offer 决策">
            <View style={styles.sectionBody}>
              <View style={styles.readingCard}>
                <Text style={styles.readingTitle}>{offerSummary.title}</Text>
                <Text style={styles.readingText}>{offerSummary.detail}</Text>
              </View>
              <AdaptiveGrid minItemWidth={150} gap={10}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>总包</Text>
                  <Text
                    style={styles.offerMetricValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {formatOfferMetricValue(note.offerTotalPackage || job.salary || '未记录')}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>意向</Text>
                  <Text style={styles.metricValue}>{displayedIntentScore}</Text>
                </View>
              </AdaptiveGrid>
            </View>
          </Group>
          <Group title="薪资与入职">
            <ListRow title="月薪 / Base" detail={note.offerBaseSalary || '未记录'} />
            <ListRow title="奖金 / 年终" detail={note.offerBonus || '未记录'} />
            <ListRow title="试用期与入职" detail={[note.offerProbation, note.offerStartDate].filter(Boolean).join(' · ') || '未记录'} />
            <ListRow title="福利补充" detail={note.offerBenefits || '未记录'} />
          </Group>
          <Group title="风险与谈薪">
            <ListRow title="主要风险" detail={note.offerRisks || '未记录'} />
            <ListRow title="谈薪动作" detail={note.offerNegotiation || '未记录'} />
            <ListRow title="决策结论" detail={note.offerDecision || '未记录'} />
          </Group>
        </> : <View style={styles.offerEmptyState}>
          <AppIcon name="offer" size={34} color="#77877F" />
          <Text style={styles.detailSubject}>尚未进入 Offer</Text>
          <Text style={styles.emptyStateText}>进入 Offer 阶段后，再集中记录薪资、福利、风险和谈薪结论。</Text>
          <Pressable style={styles.primaryButton} onPress={onEdit}><Text style={styles.primaryButtonText}>录入 Offer 意向</Text></Pressable>
        </View>
      )}
      {section === 'timeline' && (
        <Group title="状态时间线">
          {events.length ? (
            events.map((event, index) => (
              <View style={styles.timelineItem} key={event.id}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDotShell, index === 0 && styles.timelineDotShellCurrent]}>
                    <View style={[styles.timelineDot, event.toStatus === 'ended' && styles.timelineDotEnded]} />
                  </View>
                  {index < events.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.rowTitle}>{event.toStatus === 'ended' ? '职位已结束' : statusMeta[event.toStatus].label}</Text>
                  <Text style={styles.rowDetail}>{formatDateTime(event.eventTime)}{event.fromStatus ? ` · 前状态：${statusMeta[event.fromStatus].label}` : ''}</Text>
                  {event.note ? <Text style={styles.rowDetail}>{event.note}</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>还没有状态变更记录。</Text>
            </View>
          )}
        </Group>
      )}
    </>
  );
}

function HrConversationPanel({
  job,
  resume,
  question,
  records,
  busy,
  onQuestionChange,
  onOpenResume,
  onGenerate,
  onDelete,
}: {
  job: Job;
  resume: ResumeVersion | null;
  question: string;
  records: HrAnswerRecord[];
  busy: boolean;
  onQuestionChange: (value: string) => void;
  onOpenResume: () => void;
  onGenerate: () => void;
  onDelete: (recordId: string) => void;
}) {
  const hasResumeContent = Boolean(resume?.content.trim());
  const resumeDisplayName = resume ? friendlyResumeName(resume.name) : '未绑定简历正文';
  return (
    <>
      <Group title="HR 沟通助手">
        <View style={styles.hrAssistantBody}>
          <View style={styles.hrContextRow}>
            <View style={styles.hrContextIcon}><AppIcon name="sparkles" size={18} color="#6D28D9" /></View>
            <View style={styles.flexOne}>
              <Text style={styles.rowTitle}>{job.company} · {job.title}</Text>
              <Text style={styles.rowDetail}>
                {resume ? `${resumeDisplayName} · ${hasResumeContent ? '简历正文已就绪' : '待补简历正文'}` : resumeDisplayName}
              </Text>
            </View>
          </View>
          {!hasResumeContent ? (
            <View style={styles.hrMissingContext}>
              <View style={styles.hrMissingContextCopy}>
                <Text style={styles.noticeTitle}>{resume ? '生成前需要补充简历正文' : '当前职位尚未绑定简历'}</Text>
                <Text style={styles.noticeText}>{resume ? `补充${resumeDisplayName}正文后即可生成有依据的回答。` : '先选择或新增一份简历，再生成有依据的回答。'}</Text>
              </View>
              <Pressable style={styles.hrMissingContextAction} onPress={onOpenResume}>
                <Text style={styles.hrMissingContextActionText}>去补充</Text>
                <AppIcon name="chevron" size={14} color="#6D28D9" />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.formField}>
            <Text style={styles.formLabel}>HR 的问题</Text>
            <TextInput
              multiline
              style={styles.hrQuestionInput}
              textAlignVertical="top"
              value={question}
              onChangeText={onQuestionChange}
              placeholder="输入 HR 的实际问题，例如：你有 ToB 客户沟通经验吗？生成后回答与依据会自动保存。"
              maxLength={1000}
            />
            <Text style={styles.inputCounter}>{question.length}/1000</Text>
          </View>
          <Pressable
            haptic="light"
            style={[styles.hrGenerateButton, (!hasResumeContent || busy) && styles.buttonDisabled]}
            disabled={!hasResumeContent || busy}
            onPress={onGenerate}
          >
            <AppIcon name="sparkles" size={18} color="#6D28D9" />
            <Text style={styles.hrGenerateButtonText}>{busy ? '正在生成回答...' : '生成推荐回答'}</Text>
          </Pressable>
        </View>
      </Group>
      {records.length ? (
        <Group title={`沟通记录 · ${records.length}`}>
          <View style={styles.hrRecordList}>
            {records.map((record) => (
              <View style={styles.hrAnswerCard} key={record.id}>
                <Text style={styles.hrQuestionLabel}>HR 问</Text>
                <Text style={styles.hrQuestionText}>{record.question}</Text>
                <View style={styles.hrAnswerDivider} />
                <Text style={styles.hrAnswerLabel}>推荐回复</Text>
                <Text selectable style={styles.hrAnswerText}>{record.answer}</Text>
                {record.evidence.length ? (
                  <View style={styles.hrEvidenceWrap}>
                    {record.evidence.map((item) => <Text style={styles.hrEvidenceTag} key={item}>{item}</Text>)}
                  </View>
                ) : null}
                {record.caution ? <Text style={styles.hrCaution}>发送前确认：{record.caution}</Text> : null}
                {record.strategy ? <Text style={styles.rowDetail}>思路：{record.strategy}</Text> : null}
                <View style={styles.hrAnswerActions}>
                  <Text style={styles.rowDetail}>{formatDateTime(record.createdAt)} · {friendlyResumeName(record.resumeName)}</Text>
                  <View style={styles.hrAnswerActionButtons}>
                    <Pressable
                      style={styles.iconButton}
                      accessibilityLabel="复制推荐回答"
                      onPress={() => {
                        void Clipboard.setStringAsync(record.answer);
                        Alert.alert('已复制', '推荐回答已复制到剪贴板。');
                      }}
                    ><AppIcon name="copy" size={17} color="#4B5563" /></Pressable>
                    <Pressable
                      style={styles.iconButton}
                      accessibilityLabel="删除沟通记录"
                      onPress={() => Alert.alert('删除这条记录？', '删除后无法恢复。', [
                        { text: '取消', style: 'cancel' },
                        { text: '删除', style: 'destructive', onPress: () => onDelete(record.id) },
                      ])}
                    ><AppIcon name="trash" size={17} color="#9A3412" /></Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Group>
      ) : null}
    </>
  );
}

function JobDetailScreen({
  job,
  note,
  events,
  resumeVersions,
  onBack,
  onCycleStatus,
  onCreateInterview,
  onUpdateJobNote,
  onBindResume,
  onDelete,
}: {
  job: Job;
  note: JobNote;
  events: ApplicationEvent[];
  resumeVersions: ResumeVersion[];
  onBack: () => void;
  onCycleStatus: (jobId: number, currentStatus: ApplicationStatus) => void;
  onCreateInterview: (job: Job) => void;
  onUpdateJobNote: (jobId: number, patch: Partial<JobNote>) => void;
  onBindResume: (resumeName: string) => void;
  onDelete: (job: Job) => void;
}) {
  return (
    <>
      <Pressable style={styles.backButton} onPress={onBack}>
        <AppIcon name="back" size={18} color="#2B3935" />
        <Text style={styles.backButtonText}>返回职位列表</Text>
      </Pressable>
      <View style={styles.detailHeader}>
        <View style={styles.jobRowHeader}>
          <View style={styles.flexOne}>
            <Text style={styles.kicker}>{job.platform}</Text>
            <Text style={styles.heroTitle}>{job.company}</Text>
            <Text style={styles.mutedText}>
              {job.title} / {job.city} / {job.salary}
            </Text>
          </View>
          <StatusPill status={job.status} onPress={() => onCycleStatus(job.id, job.status)} />
        </View>
        <View style={styles.tagRow}>
          {job.tags.map((tag) => (
            <View style={styles.tagPill} key={tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
        <View style={styles.jobActionRow}>
          <Pressable style={styles.primaryButton} onPress={() => onCreateInterview(job)}>
            <Text style={styles.primaryButtonText}>创建面试</Text>
          </Pressable>
          <Pressable style={styles.destructiveButton} onPress={() => onDelete(job)}>
            <Text style={styles.destructiveButtonText}>删除职位</Text>
          </Pressable>
        </View>
      </View>
      <Group title="简历绑定">
        <View style={styles.sectionBody}>
          <Text style={styles.paragraph}>当前使用：{job.resume}</Text>
          <View style={styles.filterRowWrap}>
            {resumeVersions.map((resume) => (
              <FilterChip
                key={resume.id}
                label={resume.name}
                active={job.resume === resume.name}
                onPress={() => onBindResume(resume.name)}
              />
            ))}
          </View>
        </View>
      </Group>
      <Group title="岗位详情">
        <View style={styles.jobDetailPanel}>
          <FormInput
            label="岗位链接"
            value={note.jobUrl}
            onChangeText={(value) => onUpdateJobNote(job.id, { jobUrl: value })}
            placeholder="招聘平台或官网链接"
          />
          <FormInput
            label="工作方式"
            value={note.workMode}
            onChangeText={(value) => onUpdateJobNote(job.id, { workMode: value })}
            placeholder="现场 / 远程 / 混合"
          />
          <FormInput
            label="经验要求"
            value={note.experience}
            onChangeText={(value) => onUpdateJobNote(job.id, { experience: value })}
            placeholder="例如：1-3 年 / 不限"
          />
          <FormInput
            label="学历要求"
            value={note.education}
            onChangeText={(value) => onUpdateJobNote(job.id, { education: value })}
            placeholder="例如：本科 / 大专 / 不限"
          />
          <FormInput
            label="意向程度"
            value={note.intentScore}
            onChangeText={(value) => onUpdateJobNote(job.id, { intentScore: value })}
            placeholder="1-5 分"
          />
          <FormInput
            label="JD 摘要"
            value={note.jdSummary}
            onChangeText={(value) => onUpdateJobNote(job.id, { jdSummary: value })}
            placeholder="粘贴或整理职责、硬性要求、加分项。长 JD 可以直接写在这里。"
          />
          <FormInput
            label="下一步"
            value={note.nextAction}
            onChangeText={(value) => onUpdateJobNote(job.id, { nextAction: value })}
            placeholder="例如：明天上午补投简历 / 周五跟进 HR"
          />
          <View style={styles.formField}>
            <Text style={styles.formLabel}>跟进备注</Text>
            <TextInput
              multiline
              style={styles.longNoteArea}
              textAlignVertical="top"
              value={note.note}
              onChangeText={(value) => onUpdateJobNote(job.id, { note: value })}
              placeholder="记录沟通信息、JD 风险、薪资口径、简历版本、面试线索等"
            />
          </View>
          {job.status === 'ended' ? (
            <View style={styles.infoBox}>
              <Text style={styles.rowTitle}>结束原因</Text>
              <Text style={styles.rowDetail}>{note.endReason || '未记录'}</Text>
            </View>
          ) : null}
        </View>
      </Group>
      <Group title="状态时间线">
        {events.length ? (
          events.map((event) => (
            <View style={styles.timelineRow} key={event.id}>
              <Text style={styles.rowTitle}>
                流转至：{statusMeta[event.toStatus].label}
              </Text>
              <Text style={styles.rowDetail}>{formatDateTime(event.eventTime)}</Text>
              <Text style={styles.rowDetail}>{event.note}</Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>还没有状态变更记录。</Text>
          </View>
        )}
      </Group>
    </>
  );
}

function InterviewWorkspace({
  section,
  interviews,
  allJobs,
  jobNotes,
  interviewDrafts,
  search,
  onSearchChange,
  listFilter,
  dateRange,
  onListFilterChange,
  onDateRangeChange,
  showDetail,
  selectedInterviewId,
  onSelectInterview,
  onBackToList,
  durationText,
  isRecording,
  isRecordingPaused,
  recordingHealth,
  recordingFileSizeBytes,
  recordingFreeBytes,
  recordingWriteState,
  savedAudioFileSizeBytes,
  savedAudioDurationMillis,
  recordingMetering,
  savedAudioUri,
  savedAudioName,
  audioWorkState,
  microphonePermission,
  aiBusy,
  transcriptionProgress,
  transcriptionState,
  transcriptionError,
  transcriptionCompletedParts,
  transcriptionTotalParts,
  transcriptionProvider,
  aiConfigured,
  result,
  interviewResults,
  playbackCurrentTime,
  playbackDuration,
  isPlaying,
  playbackTargetSeconds,
  playbackRequestState,
  transcript,
  transcriptQaPairs,
  transcriptOrganizationState,
  transcriptOrganizationError,
  transcriptOrganizationCompletedChunks,
  transcriptOrganizationTotalChunks,
  note,
  interviewerName,
  interviewerTitle,
  endAt,
  selfIntroduction,
  projectStories,
  companyResearch,
  roleUnderstanding,
  manualQuestions,
  improvedAnswer,
  reviewOverall,
  reviewStrengths,
  reviewRisks,
  reviewScores,
  reviewQuestionDetails,
  reviewActionItems,
  reviewProgressComparedWithPast,
  reviewRecurringPatterns,
  reviewGenerationError,
  reviewGenerationState,
  interviewMode,
  selfSpeakerLabel,
  questionsForInterviewer,
  followUpAction,
  reminderAt,
  recordMarkers,
  preparationMaterials,
  preparationAiBusy,
  checklistDone,
  onShowCompliance,
  onCheckMicrophonePermission,
  onPause,
  onStop,
  onUpload,
  onTogglePlayback,
  onPlayAtPlayback,
  onSeekPlayback,
  onResultChange,
  onCreateNextRound,
  onKeepOnly,
  onTranscribe,
  onReview,
  onCancelReview,
  onTranscriptChange,
  onOrganizeTranscript,
  onReorganizeTranscript,
  onReorganizeTranscriptAsGroup,
  onNoteChange,
  onQuestionsChange,
  onFollowUpActionChange,
  onInterviewerNameChange,
  onInterviewerTitleChange,
  onEndAtChange,
  onSelfIntroductionChange,
  onProjectStoriesChange,
  onCompanyResearchChange,
  onRoleUnderstandingChange,
  onManualQuestionsChange,
  onImprovedAnswerChange,
  onReviewOverallChange,
  onReviewStrengthsChange,
  onReviewRisksChange,
  onInterviewModeChange,
  onSelfSpeakerLabelChange,
  onClearReview,
  onReminderAtChange,
  onPreparationMaterialsChange,
  onGeneratePreparation,
  onToggleChecklistItem,
  onDeleteAudio,
  onAddRecordMarker,
  onDeleteInterview,
  selectedListIds,
  onSelectedListIdsChange,
  onArchiveSelected,
  onDeleteSelected,
  onSetSelectedStatus,
  onUpdateInterview,
  onCreateInterview,
  onOpenMockInterview,
  onSectionChange,
  onReviewContentViewChange,
  onOpenJob,
  hideNavigationBar = false,
}: {
  section: InterviewDetailSection;
  interviews: Interview[];
  allJobs: Job[];
  jobNotes: Record<number, JobNote>;
  interviewDrafts: Record<number, InterviewDraft>;
  search: string;
  onSearchChange: (value: string) => void;
  listFilter: InterviewListFilter;
  dateRange: DateRangeValue;
  onListFilterChange: (value: InterviewListFilter) => void;
  onDateRangeChange: (value: DateRangeValue) => void;
  showDetail: boolean;
  selectedInterviewId: number;
  onSelectInterview: (id: number) => void;
  onBackToList: () => void;
  durationText: string;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingHealth: RecordingHealth;
  recordingFileSizeBytes: number;
  recordingFreeBytes: number;
  recordingWriteState: 'checking' | 'writing' | 'waiting';
  savedAudioFileSizeBytes: number;
  savedAudioDurationMillis: number;
  recordingMetering?: number;
  savedAudioUri: string | null;
  savedAudioName: string | null;
  audioWorkState: AudioWorkState;
  microphonePermission: { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };
  aiBusy: 'transcribing' | 'reviewing' | null;
  transcriptionProgress: { completed: number; total: number } | null;
  transcriptionState: InterviewDraft['transcriptionState'];
  transcriptionError: string;
  transcriptionCompletedParts: number;
  transcriptionTotalParts: number;
  transcriptionProvider: AiServiceSettings['transcriptionProvider'];
  aiConfigured: boolean;
  result: InterviewResult;
  interviewResults: Record<number, InterviewResult>;
  playbackCurrentTime: number;
  playbackDuration: number;
  isPlaying: boolean;
  playbackTargetSeconds: number | null;
  playbackRequestState: PlaybackRequestState;
  transcript: string;
  transcriptQaPairs: TranscriptQaPair[];
  transcriptOrganizationState: InterviewDraft['transcriptOrganizationState'];
  transcriptOrganizationError: string;
  transcriptOrganizationCompletedChunks: number;
  transcriptOrganizationTotalChunks: number;
  note: string;
  interviewerName: string;
  interviewerTitle: string;
  endAt: string;
  selfIntroduction: string;
  projectStories: string;
  companyResearch: string;
  roleUnderstanding: string;
  manualQuestions: string;
  improvedAnswer: string;
  reviewOverall: string;
  reviewStrengths: string;
  reviewRisks: string;
  reviewScores: Record<string, number>;
  reviewQuestionDetails: InterviewDraft['reviewQuestionDetails'];
  reviewActionItems: string[];
  reviewProgressComparedWithPast: string;
  reviewRecurringPatterns: string[];
  reviewGenerationError: string;
  reviewGenerationState: InterviewDraft['reviewGenerationState'];
  interviewMode: InterviewDraft['interviewMode'];
  selfSpeakerLabel: string;
  questionsForInterviewer: string;
  followUpAction: string;
  reminderAt: string;
  recordMarkers: string[];
  preparationMaterials: PreparationMaterial[];
  preparationAiBusy: boolean;
  checklistDone: Record<string, boolean>;
  onShowCompliance: () => void;
  onCheckMicrophonePermission: () => Promise<boolean>;
  onPause: () => void;
  onStop: () => void;
  onUpload: () => void;
  onTogglePlayback: () => void;
  onPlayAtPlayback: (seconds: number) => void;
  onSeekPlayback: (seconds: number) => void;
  onResultChange: (result: InterviewResult) => void;
  onCreateNextRound: () => void;
  onKeepOnly: () => void;
  onTranscribe: () => void;
  onReview: () => void;
  onCancelReview: () => void;
  onTranscriptChange: (text: string) => void;
  onOrganizeTranscript: () => void;
  onReorganizeTranscript: () => void;
  onReorganizeTranscriptAsGroup: () => void;
  onNoteChange: (text: string) => void;
  onQuestionsChange: (text: string) => void;
  onFollowUpActionChange: (text: string) => void;
  onInterviewerNameChange: (text: string) => void;
  onInterviewerTitleChange: (text: string) => void;
  onEndAtChange: (text: string) => void;
  onSelfIntroductionChange: (text: string) => void;
  onProjectStoriesChange: (text: string) => void;
  onCompanyResearchChange: (text: string) => void;
  onRoleUnderstandingChange: (text: string) => void;
  onManualQuestionsChange: (text: string) => void;
  onImprovedAnswerChange: (text: string) => void;
  onReviewOverallChange: (text: string) => void;
  onReviewStrengthsChange: (text: string) => void;
  onReviewRisksChange: (text: string) => void;
  onInterviewModeChange: (value: InterviewDraft['interviewMode']) => void;
  onSelfSpeakerLabelChange: (text: string) => void;
  onClearReview: () => void;
  onReminderAtChange: (text: string) => void;
  onPreparationMaterialsChange: (materials: PreparationMaterial[]) => void;
  onGeneratePreparation: () => void;
  onToggleChecklistItem: (item: string) => void;
  onDeleteAudio: () => void;
  onAddRecordMarker: () => void;
  onDeleteInterview: (interview: Interview) => void;
  selectedListIds: number[];
  onSelectedListIdsChange: (ids: number[]) => void;
  onArchiveSelected: (interviewIds: number[]) => void;
  onDeleteSelected: (interviewIds: number[]) => void;
  onSetSelectedStatus: (interviewIds: number[], status: Interview['status']) => void;
  onUpdateInterview: (interviewId: number, patch: Partial<Interview>) => void;
  onCreateInterview: () => void;
  onOpenMockInterview: () => void;
  onSectionChange: (section: InterviewDetailSection) => void;
  onReviewContentViewChange: (view: ReviewContentView) => void;
  onOpenJob: (jobId: number) => void;
  hideNavigationBar?: boolean;
}) {
  const { isCompact } = useResponsiveLayout();
  const [materialEditor, setMaterialEditor] = useState<PreparationMaterial | null>(null);
  const [isNewMaterial, setIsNewMaterial] = useState(false);
  const [isSortingMaterials, setIsSortingMaterials] = useState(false);
  const [isEditingPreparation, setIsEditingPreparation] = useState(false);
  const [showInterviewSettings, setShowInterviewSettings] = useState(false);
  const [expandedTranscriptSegments, setExpandedTranscriptSegments] = useState<Record<number, boolean>>({});
  const [expandedQaPairs, setExpandedQaPairs] = useState<Record<string, boolean>>({});
  const [visibleQaPairCount, setVisibleQaPairCount] = useState(8);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [reviewContentView, setReviewContentView] = useState<ReviewContentView>('overview');
  const [showReviewScores, setShowReviewScores] = useState(false);
  const [showResultPicker, setShowResultPicker] = useState(false);
  const [showInterviewExport, setShowInterviewExport] = useState(false);
  const [interviewExportContent, setInterviewExportContent] = useState<InterviewReportContent>('all');
  const [exportWithTimestamps, setExportWithTimestamps] = useState(true);
  const [interviewExportBusy, setInterviewExportBusy] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderDate, setReminderDate] = useState(() => parseReminderDate(reminderAt));
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const interviewSelectionMode = selectedListIds.length > 0;
  const toggleSelectedInterview = (interviewId: number) => onSelectedListIdsChange(
    selectedListIds.includes(interviewId)
      ? selectedListIds.filter((id) => id !== interviewId)
      : [...selectedListIds, interviewId],
  );
  const selectedInterview = interviews.find((interview) => interview.id === selectedInterviewId) ?? interviews[0];
  const attentionTranscriptionTasks = getAttentionTranscriptionTasks(interviews, interviewDrafts);
  const attentionReviewTasks = interviews
    .map((interview) => ({ interview, draft: interviewDrafts[interview.id] ?? emptyDraft }))
    .filter(({ draft }) => draft.reviewGenerationState === 'processing' || draft.reviewGenerationState === 'failed');
  const attentionAiTaskCount = attentionTranscriptionTasks.length + attentionReviewTasks.length;
  const savedAudioDiagnostic = savedAudioUri && savedAudioFileSizeBytes
    ? diagnoseAudioFile({
        sizeBytes: savedAudioFileSizeBytes,
        durationMillis: savedAudioDurationMillis || playbackDuration * 1000,
        recordingHealth,
      })
    : null;
  const audioAuditPoints = buildAudioAuditPoints(playbackDuration || savedAudioDurationMillis / 1000);
  const canResumeTranscription = transcriptionState === 'failed'
    && transcriptionCompletedParts > 0
    && transcriptionCompletedParts < transcriptionTotalParts;
  const transcriptOrganizationPaused = transcriptOrganizationState === 'failed'
    && /应用退出时中断|应用关闭后整理已暂停/u.test(transcriptOrganizationError);

  useEffect(() => {
    setIsEditingPreparation(false);
    setShowInterviewSettings(false);
    setMaterialEditor(null);
    setExpandedTranscriptSegments({});
    setExpandedQaPairs({});
    setVisibleQaPairCount(8);
    setIsEditingTranscript(false);
    setIsEditingReview(false);
    setReviewContentView('overview');
    setShowReviewScores(false);
    setShowResultPicker(false);
    setShowInterviewExport(false);
    setShowReminderPicker(false);
    setReminderDate(parseReminderDate(reminderAt));
    setFollowUpDraft('');
  }, [selectedInterviewId]);

  useEffect(() => {
    onReviewContentViewChange(reviewContentView);
  }, [onReviewContentViewChange, reviewContentView]);

  const linkedJob = selectedInterview
    ? allJobs.find((job) => job.id === selectedInterview.jobId)
    : undefined;
  const transcriptSegments = useMemo(
    () => buildTranscriptSegments(transcript, playbackDuration || 0),
    [playbackDuration, transcript],
  );
  const visibleTranscriptSegments = useMemo(() => {
    const normalizedQuery = transcriptQuery.trim().toLowerCase();
    return transcriptSegments
      .map((segment, sourceIndex) => ({ ...segment, sourceIndex }))
      .filter((segment) => !normalizedQuery || segment.text.toLowerCase().includes(normalizedQuery));
  }, [transcriptQuery, transcriptSegments]);
  const transcriptKeywords = useMemo(
    () => extractTranscriptKeywords(transcript, linkedJob?.tags ?? []),
    [linkedJob?.tags, transcript],
  );
  const visibleTranscriptQaPairs = useMemo(
    () => transcriptQaPairs.slice(0, visibleQaPairCount),
    [transcriptQaPairs, visibleQaPairCount],
  );

  if (!selectedInterview) {
    return (
      <>
        <TextInput
          style={styles.searchInput}
          placeholderTextColor="#8A918D"
          value={search}
          onChangeText={onSearchChange}
          placeholder="搜索公司、岗位、轮次、时间"
        />
        <View style={styles.filterRowWrap}>
          {interviewFilterOptions.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              active={listFilter === option.value}
              onPress={() => onListFilterChange(option.value)}
            />
          ))}
        </View>
        <DateRangeDropdown value={dateRange} onChange={onDateRangeChange} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>没有匹配的面试记录。</Text>
        </View>
      </>
    );
  }
  const linkedJobNote = linkedJob ? jobNotes[linkedJob.id] : undefined;
  const meaningfulJdSummary = isMeaningfulJdSummary(selectedInterview.jdSummary)
    ? selectedInterview.jdSummary
    : isMeaningfulJdSummary(linkedJobNote?.jdSummary ?? '')
      ? linkedJobNote?.jdSummary ?? ''
      : '';
  const preparationRecommendations = buildPreparationRecommendations({
    jobTitle: linkedJob?.title ?? '',
    interviewTitle: selectedInterview.title,
    round: selectedInterview.round,
    tags: linkedJob?.tags ?? [],
    jdSummary: meaningfulJdSummary,
  });
  const pendingPreparationRecommendations = excludeExistingRecommendations(
    preparationRecommendations,
    preparationMaterials,
  );
  const jdParagraphs = splitReadableParagraphs(meaningfulJdSummary);
  const focusedPlaybackSeconds = isPlaying ? playbackCurrentTime : playbackTargetSeconds;
  const activeQaPairIndex = focusedPlaybackSeconds === null
    ? -1
    : findActiveTimedItemIndex(transcriptQaPairs, focusedPlaybackSeconds);
  const activeTranscriptSegmentIndex = focusedPlaybackSeconds === null
    ? -1
    : findActiveTimedItemIndex(transcriptSegments, focusedPlaybackSeconds);
  const completedChecklistCount = selectedInterview.checklist.filter((item) => checklistDone[item]).length;
  const hasIntroMaterial = preparationMaterials.some((item) => item.kind === 'intro' && item.body.trim());
  const hasProjectMaterial = preparationMaterials.some((item) => item.kind === 'project' && item.body.trim());
  const readinessItems = [
    { label: 'JD 摘要', done: Boolean(meaningfulJdSummary) },
    { label: '准备清单', done: Boolean(selectedInterview.checklist.length) && completedChecklistCount === selectedInterview.checklist.length },
    { label: '自我介绍和项目', done: hasIntroMaterial && hasProjectMaterial },
    { label: '反问问题', done: Boolean(questionsForInterviewer.trim()) },
  ];
  const readinessDone = readinessItems.filter((item) => item.done).length;
  const readinessMissing = readinessItems.filter((item) => !item.done).map((item) => item.label);
  const readinessPercent = Math.round((readinessDone / readinessItems.length) * 100);
  const recordingLevel = typeof recordingMetering === 'number'
    ? Math.max(0.12, Math.min(1, (recordingMetering + 60) / 60))
    : 0.12;
  const hasReviewContent = Boolean(reviewOverall.trim() || reviewStrengths.trim() || reviewRisks.trim());
  const reviewScoreEntries = Object.entries(reviewScores);
  const reviewAverageScore = reviewScoreEntries.length
    ? (reviewScoreEntries.reduce((sum, [, score]) => sum + score, 0) / reviewScoreEntries.length).toFixed(1)
    : '—';
  const reviewHeadlineSource = reviewOverall.split(/[。！？\n]/).map((item) => item.trim()).find(Boolean) ?? '';
  const reviewHeadline = reviewHeadlineSource.length > 54
    ? `${reviewHeadlineSource.slice(0, 54)}…`
    : reviewHeadlineSource || '复盘已生成';
  const reviewOverviewBody = reviewHeadlineSource && reviewOverall.startsWith(reviewHeadlineSource)
    ? reviewOverall.slice(reviewHeadlineSource.length).replace(/^[。！？\s]+/, '').trim() || reviewStrengths
    : reviewOverall;
  const followUpRecords = parseFollowUpRecords(followUpAction, note);

  function handleReminderValueChange(selected: Date) {
    setReminderDate(selected);
    onReminderAtChange(formatReminderDate(selected));
    void scheduleInterviewReminder({
      interviewId: selectedInterview.id,
      date: selected,
      title: `${selectedInterview.company} · ${selectedInterview.round}`,
      body: followUpAction.trim() || '查看面试跟进事项并更新进度。',
    }).catch((error: unknown) => {
      Alert.alert('提醒设置失败', error instanceof Error ? error.message : '系统通知没有成功安排。');
    });
    setShowReminderPicker(false);
  }

  function appendFollowUpRecord() {
    const body = followUpDraft.trim();
    if (!body) return;
    const record = `[${formatReminderDate(new Date())}] ${body}`;
    onFollowUpActionChange([followUpAction.trim(), record].filter(Boolean).join('\n'));
    setFollowUpDraft('');
  }

  function openNewMaterial() {
    const template = preparationMaterialTemplates[0];
    setIsNewMaterial(true);
    setMaterialEditor({
      id: `material-${Date.now()}`,
      kind: template.kind,
      title: template.title,
      body: template.body,
      importance: 'normal',
    });
  }

  function applyMaterialTemplate(kind: PreparationMaterialKind) {
    const template = preparationMaterialTemplates.find((item) => item.kind === kind) ?? preparationMaterialTemplates.at(-1)!;
    setMaterialEditor((current) =>
      current
        ? {
            ...current,
            kind,
            title: isNewMaterial ? template.title : current.title,
            body: isNewMaterial ? template.body : current.body,
          }
        : current,
    );
  }

  function saveMaterial() {
    if (!materialEditor?.title.trim()) {
      Alert.alert('请填写材料标题');
      return;
    }
    if (!materialEditor.body.trim()) {
      Alert.alert('请填写材料内容');
      return;
    }
    const normalized = { ...materialEditor, title: materialEditor.title.trim(), body: materialEditor.body.trim() };
    const next = isNewMaterial
      ? [...preparationMaterials, normalized]
      : preparationMaterials.map((item) => (item.id === normalized.id ? normalized : item));
    onPreparationMaterialsChange(next);
    setMaterialEditor(null);
  }

  function moveMaterial(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= preparationMaterials.length) {
      return;
    }
    const next = [...preparationMaterials];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onPreparationMaterialsChange(next);
  }

  function addRecommendedMaterials() {
    if (!pendingPreparationRecommendations.length) return;
    const createdAt = Date.now();
    onPreparationMaterialsChange([
      ...preparationMaterials,
      ...pendingPreparationRecommendations.map(({ reason: _reason, sourceKeywords: _sourceKeywords, ...material }, index) => ({
        ...material,
        id: `recommended-${selectedInterview.id}-${createdAt + index}`,
      })),
    ]);
  }

  function addRecommendedMaterial(recommendation: (typeof pendingPreparationRecommendations)[number]) {
    const { reason: _reason, sourceKeywords: _sourceKeywords, ...material } = recommendation;
    onPreparationMaterialsChange([
      ...preparationMaterials,
      { ...material, id: `recommended-${selectedInterview.id}-${Date.now()}` },
    ]);
  }

  function addReviewActionToPreparation(item: string, index: number) {
    const exists = preparationMaterials.some((material) => normalizeText(material.body) === normalizeText(item));
    if (exists) return;
    onPreparationMaterialsChange([
      ...preparationMaterials,
      {
        id: `review-action-${selectedInterview.id}-${Date.now()}-${index}`,
        kind: 'custom',
        title: `复盘行动 ${index + 1}`,
        body: item,
        importance: 'high',
      },
    ]);
  }

  async function exportCurrentInterview() {
    if (interviewExportBusy) return;
    setInterviewExportBusy(true);
    try {
      await shareInterviewReport({
        interview: selectedInterview,
        draft: interviewDrafts[selectedInterview.id],
        result,
        job: linkedJob,
        content: interviewExportContent,
        includeTimestamps: exportWithTimestamps,
      });
      setShowInterviewExport(false);
    } catch (error) {
      Alert.alert('导出失败', error instanceof Error ? error.message : '面试记录没有成功导出。');
    } finally {
      setInterviewExportBusy(false);
    }
  }

  const listContent = (
    <>
      <FeatureCard
        icon="mockInterview"
        eyebrow="AI 模拟面试"
        title="练习一轮真实问答"
        detail="按目标岗位逐题练习，结束后生成复盘"
        tone="ai"
        onPress={onOpenMockInterview}
      />
      <View style={styles.interviewListTools}>
        <TextInput
          style={[styles.searchInput, styles.interviewListSearch]}
          placeholderTextColor="#8A918D"
          value={search}
          onChangeText={onSearchChange}
          placeholder="搜索公司、岗位或轮次"
        />
      </View>
      <View style={styles.interviewFilterToolbar}>
        <ScrollView
          horizontal
          style={styles.interviewFilterScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.interviewFilterScroller}
        >
          {interviewFilterOptions.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              active={listFilter === option.value}
              onPress={() => onListFilterChange(option.value)}
            />
          ))}
        </ScrollView>
        <DateRangeDropdown value={dateRange} onChange={onDateRangeChange} />
      </View>
      {interviewSelectionMode ? (
        <View style={styles.batchActionBar}>
          <Text style={styles.batchActionCount}>已选 {selectedListIds.length}</Text>
          <Pressable style={styles.batchActionButton} onPress={() => onSetSelectedStatus(selectedListIds, '待复盘')}><Text style={styles.batchActionText}>待复盘</Text></Pressable>
          <Pressable style={styles.batchActionButton} onPress={() => onArchiveSelected(selectedListIds)}><Text style={styles.batchActionText}>归档</Text></Pressable>
          <Pressable style={styles.batchDangerButton} onPress={() => onDeleteSelected(selectedListIds)}><Text style={styles.batchDangerText}>删除</Text></Pressable>
          <Pressable style={styles.batchCloseButton} accessibilityLabel="退出多选" onPress={() => onSelectedListIdsChange([])}><AppIcon name="close" size={19} color="#6B7280" /></Pressable>
        </View>
      ) : null}
      {attentionAiTaskCount ? (
        <View style={styles.transcriptionTaskPanel}>
          <View style={styles.transcriptionTaskHeading}>
            <Text style={styles.groupTitle}>AI 任务</Text>
            <Text style={styles.sectionMeta}>{attentionAiTaskCount} 项待处理</Text>
          </View>
          {attentionTranscriptionTasks.map(({ interview, draft }) => (
            <Pressable
              key={interview.id}
              style={styles.transcriptionTaskRow}
              onPress={() => {
                onSectionChange('record');
                onSelectInterview(interview.id);
              }}
            >
              <View style={[styles.transcriptionTaskDot, draft.transcriptionState === 'failed' && styles.transcriptionTaskDotFailed]} />
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">{interview.company} · {interview.round}</Text>
                <Text style={styles.rowDetail}>{formatTranscriptionTaskStatus(draft)}</Text>
              </View>
              <AppIcon name="chevron" size={17} color="#9CA3AF" />
            </Pressable>
          ))}
          {attentionReviewTasks.map(({ interview, draft }) => (
            <Pressable
              key={`review-${interview.id}`}
              style={styles.transcriptionTaskRow}
              onPress={() => {
                onSectionChange('review');
                onSelectInterview(interview.id);
              }}
            >
              <View style={[styles.transcriptionTaskDot, draft.reviewGenerationState === 'failed' && styles.transcriptionTaskDotFailed]} />
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">{interview.company} · {interview.round}</Text>
                <Text style={styles.rowDetail}>
                  {draft.reviewGenerationState === 'processing' ? 'AI 复盘生成中 · 完成后自动保存' : 'AI 复盘未完成 · 点击查看并重试'}
                </Text>
              </View>
              <AppIcon name="chevron" size={17} color="#9CA3AF" />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Section title="面试记录" meta={`${interviews.length} 场`} variant="list">
        {interviews.map((interview) => {
            const linkedJobForList = allJobs.find((job) => job.id === interview.jobId);
            return (
              <Pressable
                key={interview.id}
                style={[styles.interviewListRow, interview.id === selectedInterviewId && !interviewSelectionMode && styles.interviewListRowActive, selectedListIds.includes(interview.id) && styles.selectableRowActive]}
                onPress={() => interviewSelectionMode ? toggleSelectedInterview(interview.id) : onSelectInterview(interview.id)}
                onLongPress={() => toggleSelectedInterview(interview.id)}
                delayLongPress={320}
              >
                {interviewSelectionMode ? <View style={[styles.selectionBox, selectedListIds.includes(interview.id) && styles.selectionBoxActive]}>{selectedListIds.includes(interview.id) ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}</View> : null}
                <View style={styles.interviewListCopy}>
                  <View style={styles.interviewListTitleRow}>
                    <Text style={[styles.rowTitle, styles.flexOne]} numberOfLines={1} ellipsizeMode="tail">{interview.company}</Text>
                    <Text style={[styles.interviewListState, interview.status === '待复盘' ? styles.interviewListStateReview : interview.status === '待反馈' ? styles.interviewListStateFeedback : styles.interviewListStateUpcoming]}>{interview.status}</Text>
                  </View>
                  <Text style={styles.interviewListRole} numberOfLines={1} ellipsizeMode="tail">{linkedJobForList?.title ?? interview.title}</Text>
                  <Text style={styles.rowDetail} numberOfLines={1} ellipsizeMode="tail">{interview.round} · {formatInterviewSchedule(interview.startsAt, interview.id)} · {interview.type}</Text>
                </View>
              </Pressable>
            );
          })}
        {!interviews.length ? <CompactEmptyState title="没有匹配的面试" detail="调整筛选条件或新增一场面试" /> : null}
      </Section>
    </>
  );

  if (!showDetail) {
    return listContent;
  }

  return (
    <>
      {!hideNavigationBar ? (
        <NavigationBar
          title="面试详情"
          onBack={onBackToList}
        />
      ) : null}
      <View style={styles.hrDemoHeader}>
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.hrDemoCompany} numberOfLines={2}>{selectedInterview.company}</Text>
          <View style={styles.compactActionRow}>
            <Text style={styles.detailState}>{selectedInterview.status}</Text>
            <Pressable
              style={styles.detailMoreButton}
              onPress={() => { animateNextLayout(); setShowInterviewSettings((value) => !value); }}
              accessibilityRole="button"
              accessibilityLabel="面试设置"
            >
              <AppIcon name="more" size={20} color="#2B3935" />
            </Pressable>
          </View>
        </View>
        <Text style={styles.hrDemoRole} numberOfLines={2}>{selectedInterview.title} · {selectedInterview.round}</Text>
        <Text style={styles.hrDemoMeta}>{formatInterviewSchedule(selectedInterview.startsAt, selectedInterview.id)} · {selectedInterview.type}</Text>
      </View>
      <SheetScaffold
        visible={showInterviewSettings}
        title="更多操作"
        subtitle={`${selectedInterview.company} · ${selectedInterview.round}`}
        onClose={() => setShowInterviewSettings(false)}
      >
          {linkedJob ? (
            <Pressable
              style={styles.settingsStatusOption}
              onPress={() => {
                setShowInterviewSettings(false);
                onOpenJob(linkedJob.id);
              }}
            >
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle}>关联职位</Text>
                <Text style={styles.rowDetail} numberOfLines={1} ellipsizeMode="tail">{linkedJob.title} · {linkedJob.platform}</Text>
              </View>
              <AppIcon name="chevron" size={18} color="#9CA3AF" />
            </Pressable>
          ) : null}
          {savedAudioUri || transcript.trim() ? (
            <Pressable
              style={styles.settingsStatusOption}
              onPress={() => {
                setShowInterviewSettings(false);
                setShowInterviewExport(true);
              }}
            >
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle}>导出面试记录</Text>
                <Text style={styles.rowDetail}>选择复盘、对话或完整记录</Text>
              </View>
              <AppIcon name="upload" size={18} color="#6B7280" />
            </Pressable>
          ) : null}
          <Pressable style={styles.settingsDeleteRow} onPress={() => onDeleteInterview(selectedInterview)}>
            <Text style={styles.audioDeleteAction}>删除这场面试</Text>
            <AppIcon name="chevron" size={18} color="#9CA3AF" />
          </Pressable>
      </SheetScaffold>
      <SegmentedTabs
        value={section}
        options={[
          { value: 'prepare', label: '准备' },
          { value: 'record', label: '录音' },
          { value: 'review', label: '复盘' },
          { value: 'followup', label: '跟进' },
        ]}
        onChange={onSectionChange}
      />
      {section === 'prepare' && (
        <>
          <View style={styles.preparationProgressCard}>
            <View style={styles.preparationProgressLayout}>
              <View style={styles.preparationProgressRing}>
                <Text style={styles.preparationProgressPercent} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{readinessPercent}%</Text>
              </View>
              <View style={styles.flexOne}>
                <View style={styles.preparationProgressHeader}>
                  <Text style={styles.preparationProgressTitle} numberOfLines={1}>面试准备</Text>
                  <Text style={styles.preparationProgressValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{readinessDone}/{readinessItems.length}</Text>
                </View>
                <View style={styles.preparationProgressTrack}><View style={[styles.preparationProgressFill, { width: `${readinessPercent}%` }]} /></View>
                <Text style={styles.rowDetail} numberOfLines={1}>{readinessMissing.length ? `待补 ${readinessMissing.length} 项` : '准备项已完成'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.preparationMainSection}>
            <View style={styles.preparationSectionHeader}>
              <Text style={styles.groupTitle}>面试准备</Text>
              <Pressable style={styles.inlineEditButton} onPress={() => { animateNextLayout(); setIsEditingPreparation((value) => !value); }}>
                <Text style={styles.inlineEditButtonText}>{isEditingPreparation ? '保存' : '编辑'}</Text>
              </Pressable>
            </View>
            {isEditingPreparation ? (
              <View style={styles.preparationEditor}>
                <Text style={styles.preparationSubheading}>面试信息</Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>面试模式</Text>
                  <View style={styles.filterRowWrap}>
                    <FilterChip label="普通面试" active={interviewMode === 'individual'} onPress={() => onInterviewModeChange('individual')} />
                    <FilterChip label="多人面试" active={interviewMode === 'group'} onPress={() => onInterviewModeChange('group')} />
                  </View>
                </View>
                {interviewMode === 'group' ? (
                  <FormInput
                    label="我的说话人标签"
                    value={selfSpeakerLabel}
                    onChangeText={onSelfSpeakerLabelChange}
                    placeholder="例如：说话人 B；转写分离后确认"
                  />
                ) : null}
                <FormInput label="公司" value={selectedInterview.company} onChangeText={(value) => onUpdateInterview(selectedInterview.id, { company: value })} placeholder="公司名称" />
                <FormInput label="岗位" value={selectedInterview.title} onChangeText={(value) => onUpdateInterview(selectedInterview.id, { title: value })} placeholder="岗位名称" />
                <ResponsiveRow>
                  <View style={styles.flexOne}><FormInput label="轮次" value={selectedInterview.round} onChangeText={(value) => onUpdateInterview(selectedInterview.id, { round: value })} placeholder="HR 面" /></View>
                  <View style={styles.flexOne}><FormInput label="形式" value={selectedInterview.type} onChangeText={(value) => onUpdateInterview(selectedInterview.id, { type: value })} placeholder="现场" /></View>
                </ResponsiveRow>
                <InterviewDateTimeField value={selectedInterview.startsAt} recordId={selectedInterview.id} onChange={(value) => onUpdateInterview(selectedInterview.id, { startsAt: value })} />
                <ResponsiveRow>
                  <View style={styles.flexOne}><FormInput label="面试官" value={interviewerName} onChangeText={onInterviewerNameChange} placeholder="可选" /></View>
                  <View style={styles.flexOne}><FormInput label="职位" value={interviewerTitle} onChangeText={onInterviewerTitleChange} placeholder="HR" /></View>
                </ResponsiveRow>
                <Text style={styles.preparationSubheading}>准备内容</Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>JD 摘要</Text>
                  <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={selectedInterview.jdSummary} onChangeText={(value) => onUpdateInterview(selectedInterview.id, { jdSummary: value })} placeholder="面试前需要看的 JD 要点" />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>准备清单</Text>
                  <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={selectedInterview.checklist.join('\n')} onChangeText={(value) => onUpdateInterview(selectedInterview.id, { checklist: splitLines(value) })} placeholder="一行一个准备项" />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>反问与关注点</Text>
                  <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={questionsForInterviewer} onChangeText={onQuestionsChange} placeholder="记录准备向面试官确认的问题" />
                </View>
                <FormInput label="结束时间" value={endAt} onChangeText={onEndAtChange} placeholder="面试结束后补充" />
                <Pressable haptic="light" style={styles.primaryButton} onPress={() => { animateNextLayout(); setIsEditingPreparation(false); }}>
                  <Text style={styles.primaryButtonText}>保存并返回</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.preparationReading}>
                {interviewMode === 'group' ? (
                  <View style={styles.preparationReadingBlock}>
                    <Text style={styles.preparationSubheading}>多人面试身份</Text>
                    <Text style={styles.readingText}>{selfSpeakerLabel.trim() ? `已确认：${selfSpeakerLabel.trim()}` : '尚未确认自己的说话人标签'}</Text>
                  </View>
                ) : null}
                <View style={styles.preparationReadingBlock}>
                  <Text style={styles.preparationSubheading}>JD 速览</Text>
                  {jdParagraphs.length ? jdParagraphs.slice(0, 3).map((paragraph, index) => (
                    <Text style={styles.readingText} key={`${paragraph}-${index}`}>{paragraph}</Text>
                  )) : <Pressable style={styles.inlineEditButton} onPress={() => { animateNextLayout(); setIsEditingPreparation(true); }}><Text style={styles.inlineEditButtonText}>补充 JD</Text></Pressable>}
                </View>
                <View style={styles.preparationChecklist}>
                  {selectedInterview.checklist.map((item) => (
                    <Pressable haptic="selection" style={styles.compactCheckRow} key={item} onPress={() => onToggleChecklistItem(item)}>
                      <View style={[styles.checkMark, checklistDone[item] && styles.checkMarkDone]}>
                        <AppIcon name={checklistDone[item] ? 'check' : 'circle'} size={18} color={checklistDone[item] ? '#047857' : '#9CA3AF'} />
                      </View>
                      <Text style={[styles.rowTitle, styles.flexOne, checklistDone[item] && styles.doneText]}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
                {questionsForInterviewer.trim() ? (
                  <View style={styles.preparationReadingBlock}>
                    <Text style={styles.preparationSubheading}>反问与关注点</Text>
                    <Text style={styles.readingText}>{questionsForInterviewer}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <View style={styles.preparationRecommendationCard}>
            <View style={styles.preparationRecommendationHeader}>
              <View style={styles.preparationRecommendationIcon}>
                <AppIcon name="sparkles" size={18} color="#6D28D9" />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.preparationRecommendationTitle}>岗位准备建议</Text>
                <Text style={styles.rowDetail} numberOfLines={2}>
                  {linkedJob
                    ? `已结合 ${linkedJob.title}、JD 职责和 ${selectedInterview.round}`
                    : `根据 ${selectedInterview.title || '当前岗位'} 和 ${selectedInterview.round} 提供默认模板`}
                </Text>
              </View>
            </View>
            {pendingPreparationRecommendations.length ? (
              <View style={styles.preparationRecommendationList}>
                {pendingPreparationRecommendations.slice(0, 4).map((recommendation) => (
                  <Pressable
                    style={styles.preparationRecommendationRow}
                    key={`${recommendation.kind}-${recommendation.title}`}
                    onPress={() => addRecommendedMaterial(recommendation)}
                  >
                    <View style={styles.preparationRecommendationDot} />
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{recommendation.title}</Text>
                      <Text style={styles.rowDetail} numberOfLines={1}>{recommendation.reason}</Text>
                    </View>
                    <AppIcon name="add" size={17} color="#6D28D9" />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.rowDetail}>默认建议已加入材料库，可继续用 AI 补充更具体的准备内容。</Text>
            )}
            <View style={styles.preparationRecommendationActions}>
              {pendingPreparationRecommendations.length ? (
                <Pressable style={styles.preparationRecommendationAction} onPress={addRecommendedMaterials}>
                  <Text style={styles.preparationRecommendationActionText}>全部加入</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.preparationRecommendationAction, preparationAiBusy && styles.buttonDisabled]}
                disabled={preparationAiBusy}
                onPress={onGeneratePreparation}
              >
                <AppIcon name="sparkles" size={16} color="#6D28D9" />
                <Text style={styles.preparationRecommendationActionText}>
                  {preparationAiBusy ? '正在补充…' : aiConfigured ? 'AI 补充' : '配置 AI'}
                </Text>
              </Pressable>
            </View>
          </View>

          <CollapsibleGroup title={`准备材料${preparationMaterials.length ? ` · ${preparationMaterials.length}` : ''}`}>
            <View style={styles.materialToolbar}>
              <Pressable style={styles.primaryButton} onPress={openNewMaterial}>
                <AppIcon name="add" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>添加材料</Text>
              </Pressable>
              {preparationMaterials.length > 1 ? (
                <Pressable style={styles.secondaryButton} onPress={() => setIsSortingMaterials((value) => !value)}>
                  <Text style={styles.secondaryButtonText}>{isSortingMaterials ? '完成排序' : '调整顺序'}</Text>
                </Pressable>
              ) : null}
            </View>
            {preparationMaterials.length ? (
              preparationMaterials.map((item, index) => (
                <Pressable
                  key={item.id}
                  style={[styles.materialCard, item.importance === 'high' && styles.materialCardImportant]}
                  onPress={() => {
                    setIsNewMaterial(false);
                    setMaterialEditor(item);
                  }}
                  onLongPress={() => setIsSortingMaterials(true)}
                  delayLongPress={350}
                >
                  <View style={styles.materialHeader}>
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle}>{item.title}</Text>
                      <Text style={styles.materialMeta}>
                        {preparationMaterialTemplates.find((template) => template.kind === item.kind)?.label ?? '自定义'}
                        {item.importance === 'high' ? ' · 重点' : ''}
                      </Text>
                    </View>
                    <Text style={styles.materialEditAction}>编辑</Text>
                  </View>
                  <Text style={styles.materialBody} numberOfLines={isSortingMaterials ? 2 : 6}>
                    {item.body}
                  </Text>
                  {isSortingMaterials ? (
                    <View style={styles.materialSortRow}>
                      <Text style={styles.rowDetail}>第 {index + 1} 项</Text>
                      <View style={styles.compactActionRow}>
                        <Pressable
                          accessibilityLabel="上移材料"
                          style={[styles.iconButton, index === 0 && styles.buttonDisabled]}
                          disabled={index === 0}
                          onPress={(event) => {
                            event.stopPropagation();
                            moveMaterial(index, -1);
                          }}
                        >
                          <AppIcon name="moveUp" size={18} color="#4B5563" />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="下移材料"
                          style={[styles.iconButton, index === preparationMaterials.length - 1 && styles.buttonDisabled]}
                          disabled={index === preparationMaterials.length - 1}
                          onPress={(event) => {
                            event.stopPropagation();
                            moveMaterial(index, 1);
                          }}
                        >
                          <AppIcon name="moveDown" size={18} color="#4B5563" />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>还没有准备材料。添加后会按你设定的顺序展示，重要内容可以放在最前面。</Text>
              </View>
            )}
          </CollapsibleGroup>
        </>
      )}
      {section === 'record' && (
        <View style={styles.recordingWorkspace}>
          {microphonePermission.status !== 'granted' ? (
            <View style={styles.permissionStrip}>
              <View style={styles.permissionStripCopy}>
                <Text style={styles.rowTitle}>需要麦克风权限</Text>
                <Text style={styles.rowDetail}>录音只会在你点击开始后进行</Text>
              </View>
              <Pressable
                style={styles.permissionAction}
                onPress={() => {
                  if (!microphonePermission.canAskAgain) {
                    void Linking.openSettings();
                    return;
                  }
                  void onCheckMicrophonePermission();
                }}
              >
                <Text style={styles.permissionActionText}>{microphonePermission.canAskAgain ? '授权' : '设置'}</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.recordingStage, isRecording && styles.recordingStageActive]}>
            <Text style={styles.recordingStageTitle}>{isRecording ? durationText : savedAudioUri ? '录音已保存' : '准备录音'}</Text>
            <Text style={[styles.recordingStageMeta, isRecording && recordingHealth === 'quiet' && styles.recordingCompactMetaWarning]}>
              {isRecording
                ? (isRecordingPaused ? '录音已暂停，可继续或直接保存' : recordingHealth === 'healthy' ? '声音正常' : recordingHealth === 'quiet' ? '声音偏弱' : '正在确认声音')
                : savedAudioUri
                  ? '可播放核对；重新录音会替换当前文件'
                  : '点击中央按钮开始记录'}
            </Text>
            {isRecording ? (
              <View style={styles.recordingSafetyRow}>
                <Text style={[styles.recordingSafetyText, recordingWriteState === 'waiting' && styles.recordingCompactMetaWarning]}>
                  {recordingWriteState === 'writing'
                    ? `持续写入 · ${formatStorageSize(recordingFileSizeBytes)}`
                    : recordingWriteState === 'waiting'
                      ? '暂未检测到文件增长'
                      : '正在检查文件写入'}
                </Text>
                {recordingFreeBytes ? <Text style={styles.recordingSafetyText}>剩余 {formatStorageSize(recordingFreeBytes)}</Text> : null}
              </View>
            ) : null}
            <View style={styles.recordingWaveform} accessibilityLabel={isRecording ? '实时声音强度' : '录音波形待机'}>
              {[0.42, 0.7, 1, 0.58, 0.82, 0.5, 0.9, 0.64, 0.76, 0.46, 0.88, 0.56].map((factor, index) => (
                <View key={index} style={[styles.recordingWaveBar, { height: 8 + 34 * recordingLevel * factor }, isRecording && styles.recordingWaveBarActive]} />
              ))}
            </View>
            <View style={styles.recordMainControlShell}>
              {!isRecording ? <PulseView style={styles.recordPulseRing} /> : null}
              <Pressable
                haptic="light"
                accessibilityLabel={isRecording ? '停止并保存录音' : '开始录音'}
                style={[styles.recordMainControl, isRecording && styles.recordMainControlActive]}
                onPress={isRecording ? onStop : onShowCompliance}
              >
                <View style={[styles.recordMainControlCore, isRecording && styles.recordMainControlCoreActive]}>
                  <AppIcon name={isRecording ? 'stop' : 'record'} size={isRecording ? 28 : 34} color={isRecording ? '#FFFFFF' : '#B45353'} />
                </View>
              </Pressable>
            </View>
            {isRecording ? <View style={styles.recordingAuxiliaryActions}>
              <Pressable style={styles.markerButton} onPress={onPause}>
                <AppIcon name={isRecordingPaused ? 'play' : 'pause'} size={17} color="#2B3935" />
                <Text style={styles.markerButtonText}>{isRecordingPaused ? '继续录音' : '暂停录音'}</Text>
              </Pressable>
              {!isRecordingPaused ? <Pressable style={styles.markerButton} onPress={onAddRecordMarker}><AppIcon name="marker" size={17} color="#2B3935" /><Text style={styles.markerButtonText}>关键标记</Text></Pressable> : null}
            </View> : null}
          </View>

          {!isRecording ? <Pressable style={styles.recordImportAction} onPress={onUpload}><AppIcon name="upload" size={18} color="#6B7280" /><Text style={styles.recordImportActionText}>导入已有录音</Text></Pressable> : null}

          {savedAudioUri ? (
            <View style={styles.savedAudioCard}>
              <View style={styles.savedAudioHeader}>
                <View style={styles.savedAudioHeaderCopy}>
                  <Text style={styles.rowTitle}>已保存的录音</Text>
                  <Text style={styles.savedAudioName} numberOfLines={1} ellipsizeMode="tail">{savedAudioName}</Text>
                </View>
                <Text style={styles.audioStateLabel}>
                  {getAudioWorkStateLabel(audioWorkState)}
                </Text>
              </View>
              <View style={styles.playbackRow}>
                <Pressable style={styles.playbackButton} onPress={onTogglePlayback}>
                  <AppIcon name={isPlaying ? 'pause' : 'play'} size={20} color="#FFFFFF" />
                </Pressable>
                <View style={styles.playbackTimeline}>
                  <AudioScrubber
                    currentTime={playbackCurrentTime || 0}
                    duration={playbackDuration || 0}
                    onSeek={onSeekPlayback}
                  />
                  <View style={styles.playbackTimes}>
                    <Text style={styles.playbackTimeText} maxFontSizeMultiplier={1.1}>{formatDuration(Math.floor(playbackCurrentTime || 0))}</Text>
                    <Text style={[styles.playbackTimeText, styles.playbackTimeEnd]} maxFontSizeMultiplier={1.1}>{formatDuration(Math.floor(playbackDuration || 0))}</Text>
                  </View>
                </View>
              </View>
              {savedAudioDiagnostic ? (
                <View style={styles.audioDiagnosticRow}>
                  <View style={[
                    styles.audioDiagnosticDot,
                    savedAudioDiagnostic.level === 'warning' && styles.audioDiagnosticDotWarning,
                    savedAudioDiagnostic.level === 'invalid' && styles.audioDiagnosticDotInvalid,
                  ]} />
                  <View style={styles.flexOne}>
                    <Text style={styles.audioDiagnosticTitle}>{savedAudioDiagnostic.label} · {formatStorageSize(savedAudioFileSizeBytes)}</Text>
                    <Text style={styles.rowDetail}>{savedAudioDiagnostic.detail}</Text>
                  </View>
                </View>
              ) : null}
              {audioAuditPoints.length > 1 ? (
                <View style={styles.audioAuditRow}>
                  {audioAuditPoints.map((point) => (
                    <Pressable key={point.label} style={styles.audioAuditButton} onPress={() => onPlayAtPlayback(point.seconds)}>
                      <AppIcon name="play" size={13} color="#4B5563" />
                      <Text style={styles.audioAuditButtonText}>{point.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {recordMarkers.length ? (
                <Text style={styles.markerSummary} numberOfLines={1} ellipsizeMode="tail">已添加 {recordMarkers.length} 个关键标记 · {recordMarkers.join('、')}</Text>
              ) : null}
              {transcriptionState === 'processing' ? (
                <View style={styles.transcriptionErrorBox}>
                  <Text style={styles.transcriptionErrorTitle}>正在转写</Text>
                  <Text style={styles.rowDetail}>
                    {transcriptionTotalParts > 0
                      ? `已完成 ${transcriptionCompletedParts}/${transcriptionTotalParts} 段，完成一段即自动保存`
                      : '正在准备模型和音频，开始分段后会显示准确进度'}
                  </Text>
                </View>
              ) : transcriptionState === 'completed' && transcriptionTotalParts > 0 ? (
                <Text style={styles.markerSummary}>转写完成 · 已保存 {transcriptionCompletedParts}/{transcriptionTotalParts} 段</Text>
              ) : null}
              {transcriptionState === 'failed' && transcriptionCompletedParts > 0 ? (
                <Text style={styles.markerSummary}>
                  转写中断，已保存 {transcriptionCompletedParts}/{transcriptionTotalParts} 段
                </Text>
              ) : null}
              {transcriptionState === 'failed' && transcriptionError.trim() ? (
                <View style={styles.transcriptionErrorBox}>
                  <Text style={styles.transcriptionErrorTitle}>{canResumeTranscription ? '可以继续转写' : '转写失败'}</Text>
                  <Text style={styles.rowDetail} numberOfLines={3}>{transcriptionError}</Text>
                </View>
              ) : null}
              <View style={styles.audioPrimaryActions}>
                <Pressable
                  style={[styles.audioSecondaryAction, aiBusy && styles.buttonDisabled]}
                  disabled={Boolean(aiBusy)}
                  onPress={() => {
                    if (audioWorkState === 'transcribed' || audioWorkState === 'reviewed') {
                      setReviewContentView('evidence');
                      onSectionChange('review');
                      return;
                    }
                    onTranscribe();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>
                    {aiBusy === 'transcribing'
                      ? transcriptionTotalParts > 0
                        ? `转写 ${transcriptionCompletedParts}/${transcriptionTotalParts}`
                        : transcriptionProgress && transcriptionProgress.total > 1
                          ? '准备音频…'
                        : '加载模型…'
                      : canResumeTranscription
                        ? '继续转写'
                        : audioWorkState === 'transcribed' || audioWorkState === 'reviewed'
                          ? '查看转写'
                          : '开始转写'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.audioPrimaryAction, aiBusy && styles.buttonDisabled]}
                  disabled={Boolean(aiBusy)}
                  onPress={() => {
                    if (audioWorkState === 'reviewed') {
                      setReviewContentView('overview');
                      onSectionChange('review');
                      return;
                    }
                    onReview();
                  }}
                >
                  <Text style={styles.primaryButtonText}>{aiBusy === 'reviewing' ? '复盘中…' : audioWorkState === 'reviewed' ? '查看复盘' : '生成复盘'}</Text>
                </Pressable>
              </View>
              <View style={styles.audioTextActions}>
                <Pressable onPress={onKeepOnly}><Text style={styles.audioTextAction}>保留音频</Text></Pressable>
                <Pressable onPress={onDeleteAudio}><Text style={styles.audioDeleteAction}>删除</Text></Pressable>
              </View>
            </View>
          ) : null}
          <CollapsibleGroup title={note.trim() ? '现场速记 · 已记录' : '现场速记'}>
            <View style={styles.sectionBody}>
              <TextInput
                multiline
                style={styles.noteArea}
                textAlignVertical="top"
                value={note}
                onChangeText={onNoteChange}
                placeholder="录音时记下关键承诺、岗位信息或需要回听的位置"
                placeholderTextColor="#8A918D"
              />
            </View>
          </CollapsibleGroup>
        </View>
      )}
      {section === 'review' && (
        <>
          <View style={styles.reviewContentToolbar}>
          <View style={styles.reviewContentSwitch}>
            {([
              { value: 'overview' as const, label: '概览' },
              { value: 'evidence' as const, label: '对话证据' },
              { value: 'review' as const, label: '深度复盘' },
            ]).map((item) => {
              const active = reviewContentView === item.value;
              return (
                <Pressable
                  key={item.value}
                  style={[styles.reviewContentSwitchItem, active && styles.reviewContentSwitchItemActive]}
                  onPress={() => setReviewContentView(item.value)}
                >
                  <Text style={[styles.reviewContentSwitchLabel, active && styles.reviewContentSwitchLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          </View>
          {reviewContentView === 'overview' ? (
            <View style={styles.reviewResultSection}>
              <ActionRow
                icon="check"
                title="面试结果"
                trailing={(
                  <View style={styles.compactActionRow}>
                    <Text style={styles.reviewResultCurrent}>{result}</Text>
                    <AppIcon name="chevron" size={17} color="#A3A8A5" />
                  </View>
                )}
                onPress={() => setShowResultPicker(true)}
              />
              {result === '进入下一轮' ? (
                <Pressable style={styles.nextRoundAction} onPress={onCreateNextRound}>
                  <View style={styles.flexOne}>
                    <Text style={styles.rowTitle}>创建下一轮面试</Text>
                    <Text style={styles.rowDetail}>继承岗位与准备材料，录音和复盘独立保存</Text>
                  </View>
                  <AppIcon name="add" size={20} color="#1D4ED8" />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {reviewContentView === 'overview' && (reviewGenerationState === 'processing' ? (
            <FadeInView style={styles.aiReviewLoadingCard}>
              <View style={styles.aiReviewLoadingHeader}>
                <AppIcon name="sparkles" size={25} color="#7C3AED" />
                <View style={styles.flexOne}>
                  <Text style={styles.rowTitle}>正在分析原始转写</Text>
                  <Text style={styles.rowDetail}>完成后自动保存</Text>
                </View>
                <Pressable style={styles.smallSecondaryButton} onPress={onCancelReview}>
                  <Text style={styles.smallSecondaryButtonText}>取消</Text>
                </Pressable>
              </View>
              <PulseView style={styles.aiSkeletonWide} />
              <PulseView style={styles.aiSkeletonMedium} />
              <PulseView style={styles.aiSkeletonShort} />
            </FadeInView>
          ) : reviewGenerationError ? (
            <View style={styles.qaOrganizationFailure}>
              <Text style={styles.rowTitle}>{hasReviewContent ? '本次生成未完成，旧复盘已保留' : '复盘未完成'}</Text>
              <ScrollView style={styles.reviewErrorScroll} nestedScrollEnabled>
                <Text selectable style={styles.rowDetail}>{reviewGenerationError}</Text>
              </ScrollView>
              <Pressable style={styles.smallSecondaryButton} onPress={onReview} disabled={Boolean(aiBusy)}>
                <Text style={styles.smallSecondaryButtonText}>重试生成</Text>
              </Pressable>
            </View>
          ) : !hasReviewContent ? (
            <Pressable style={styles.aiReviewEmptyCard} onPress={onReview} disabled={Boolean(aiBusy)}>
              <AppIcon name="sparkles" size={30} color="#7C3AED" />
              <Text style={styles.aiReviewEmptyTitle}>生成 AI 面试复盘</Text>
              <Text style={styles.emptyStateText}>基于原始转写，不受对话整理影响</Text>
            </Pressable>
          ) : null)}
          {reviewContentView === 'evidence' && transcript.trim() ? <>
          <View style={styles.transcriptDocumentSection}>
            <View style={styles.reviewSectionHeading}>
              <Text style={styles.transcriptSectionTitle}>整理后的对话</Text>
              {transcriptQaPairs.length ? (
                <View style={styles.transcriptHeadingActions}>
                  <Text style={styles.transcriptSectionCount}>{transcriptQaPairs.length} 组</Text>
                  {transcriptOrganizationState !== 'processing' && transcriptOrganizationState !== 'failed' ? (
                    <Pressable style={styles.inlineEditButton} onPress={() => Alert.alert(
                      '重新完整整理？',
                      '选择本场形式后从第一段重新整理。多人面试会按议题、面试官和候选人拆分；普通面试按问答整理。原始转写和 AI 复盘不会受影响。',
                      [
                        { text: '取消', style: 'cancel' },
                        { text: '普通面试', onPress: onReorganizeTranscript },
                        { text: '多人面试', onPress: onReorganizeTranscriptAsGroup },
                      ],
                    )}>
                      <Text style={styles.inlineEditButtonText}>重整</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
            {transcriptOrganizationState === 'processing' ? (
              <View style={styles.qaOrganizationStatus}>
                <PulseView style={styles.qaOrganizationPulse} />
                <View style={styles.flexOne}>
                  <Text style={styles.rowTitle}>
                    正在分段整理{transcriptOrganizationTotalChunks ? ` ${transcriptOrganizationCompletedChunks}/${transcriptOrganizationTotalChunks}` : ''}
                  </Text>
                  <Text style={styles.rowDetail}>逐段保存并校验覆盖范围，所有问题和追问都会整理</Text>
                </View>
              </View>
            ) : null}
            {transcriptOrganizationState === 'failed' && transcriptQaPairs.length ? (
              <View style={styles.qaOrganizationFailure}>
                <Text style={styles.rowDetail}>
                  {transcriptOrganizationPaused ? '整理已暂停。' : '整理未完成。'}已保留 {transcriptOrganizationCompletedChunks}/{transcriptOrganizationTotalChunks} 段。{transcriptOrganizationError || '可从现有进度继续。'}
                </Text>
                <Pressable style={styles.inlineEditButton} onPress={transcriptOrganizationPaused ? onOrganizeTranscript : () => Alert.alert(
                  '重新完整整理',
                  '选择本场形式后重新核对全部原文。多人面试会按议题、面试官和候选人拆分，并产生新的额度消耗。',
                  [
                    { text: '取消', style: 'cancel' },
                    { text: '普通面试', onPress: onReorganizeTranscript },
                    { text: '多人面试', onPress: onReorganizeTranscriptAsGroup },
                  ],
                )}>
                  <Text style={styles.inlineEditButtonText}>{transcriptOrganizationPaused ? '继续整理' : '重试整理'}</Text>
                </Pressable>
              </View>
            ) : null}
            {transcriptQaPairs.length && transcriptKeywords.length ? (
              <View style={styles.keywordRow}>
                {transcriptKeywords.map((keyword) => <Text style={styles.keywordTag} key={keyword}>{keyword}</Text>)}
              </View>
            ) : null}
            {transcriptQaPairs.length ? <>
            {visibleTranscriptQaPairs.map((pair, index) => {
              const sourceText = pair.sourceSegmentIndexes
                .map((sourceIndex) => transcriptSegments[sourceIndex]?.text)
                .filter(Boolean)
                .join('\n');
              const displayText = pair.answer || sourceText || '原文片段已变更，请重新整理。';
              const expanded = Boolean(expandedQaPairs[pair.id]);
              const isLong = displayText.length > 220;
              const isActive = activeQaPairIndex === index;
              const isGroupTopic = pair.format === 'group-topic' && Boolean(pair.turns?.length);
              return <View style={[styles.qaPairCard, isActive && styles.qaPairCardActive]} key={pair.id}>
                <View style={styles.qaPairMetaRow}>
                  <View style={styles.qaPairIdentity}>
                    <Text style={styles.qaPairIndex}>Q{index + 1}</Text>
                    <Text style={styles.qaPairSpeaker}>{isGroupTopic ? '讨论议题' : '问答'}</Text>
                    {pair.confidence === 'low' ? <Text style={styles.qaLowConfidence}>待核对</Text> : null}
                  </View>
                  {!isGroupTopic ? <TranscriptWaveButton
                      timeLabel={formatDuration(Math.floor(pair.startSeconds))}
                      isActive={isActive}
                      isPlaying={isActive && isPlaying}
                      isLoading={playbackRequestState === 'loading' && playbackTargetSeconds !== null && Math.abs(playbackTargetSeconds - pair.startSeconds) < 0.75}
                      disabled={!savedAudioUri}
                      onPress={() => onPlayAtPlayback(pair.startSeconds)}
                    /> : null}
                </View>
                <Text style={styles.qaPairQuestion}>{pair.question}</Text>
                {isGroupTopic ? (
                  <View style={styles.groupTopicTurns}>
                    {pair.turns?.map((turn, turnIndex) => {
                      const nextTurnStart = pair.turns?.[turnIndex + 1]?.startSeconds ?? pair.endSeconds ?? Number.POSITIVE_INFINITY;
                      const turnActive = focusedPlaybackSeconds !== null
                        && focusedPlaybackSeconds >= turn.startSeconds
                        && focusedPlaybackSeconds < nextTurnStart;
                      return (
                        <View style={styles.groupTopicTurn} key={turn.id}>
                          <View style={styles.groupTopicTurnHeader}>
                            <View style={styles.groupTopicSpeakerRow}>
                              <Text style={[
                                styles.groupTopicTurnIndex,
                                turn.role === 'self' && styles.groupTopicTurnIndexSelf,
                                turn.role === 'facilitator' && styles.groupTopicTurnIndexFacilitator,
                              ]}>{turnIndex + 1}</Text>
                              <Text style={[styles.groupTopicSpeaker, turn.role === 'self' && styles.groupTopicSpeakerSelf]} numberOfLines={1}>
                                {turn.role === 'self' ? '我' : turn.speaker}
                              </Text>
                            </View>
                            <TranscriptWaveButton
                              timeLabel={formatDuration(Math.floor(turn.startSeconds))}
                              isActive={turnActive}
                              isPlaying={turnActive && isPlaying}
                              isLoading={playbackRequestState === 'loading' && playbackTargetSeconds !== null && Math.abs(playbackTargetSeconds - turn.startSeconds) < 0.75}
                              disabled={!savedAudioUri}
                              onPress={() => onPlayAtPlayback(turn.startSeconds)}
                            />
                            <Pressable
                              accessibilityLabel={`复制${turn.role === 'self' ? '我的' : turn.speaker}发言`}
                              style={styles.groupTopicCopyAction}
                              onPress={() => { void Clipboard.setStringAsync(turn.text); }}
                            >
                              <AppIcon name="copy" size={15} color="#9CA3AF" />
                            </Pressable>
                          </View>
                          <Text style={styles.groupTopicTurnText}>{turn.text}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : <Text style={styles.qaPairAnswer} numberOfLines={isLong && !expanded ? 4 : undefined}>{displayText}</Text>}
                {!isGroupTopic && isLong ? <Pressable style={styles.qaExpandAction} onPress={() => {
                  animateNextLayout();
                  setExpandedQaPairs((current) => ({ ...current, [pair.id]: !expanded }));
                }}><Text style={styles.expandTranscript}>{expanded ? '收起回答' : '展开回答'}</Text></Pressable> : null}
              </View>
            })}
            {visibleTranscriptQaPairs.length < transcriptQaPairs.length ? (
              <Pressable style={styles.transcriptLoadMore} onPress={() => setVisibleQaPairCount((count) => count + 8)}>
                <Text style={styles.transcriptLoadMoreText}>继续显示其余 {transcriptQaPairs.length - visibleTranscriptQaPairs.length} 组</Text>
                <AppIcon name="chevronDown" size={17} color="#6B7280" />
              </Pressable>
            ) : null}
            </> : transcriptOrganizationState === 'failed' ? (
              <View style={[styles.qaOrganizationEmpty, styles.qaOrganizationFailure]}>
                <Text style={styles.rowDetail}>{transcriptOrganizationError || '整理中断，原始转写已保留。'}</Text>
                <Pressable style={styles.inlineEditButton} onPress={transcriptOrganizationPaused ? onOrganizeTranscript : () => Alert.alert(
                  '重新完整整理',
                  '选择本场形式后重新核对全部原文。多人面试会按议题、面试官和候选人拆分，并产生新的额度消耗。',
                  [
                    { text: '取消', style: 'cancel' },
                    { text: '普通面试', onPress: onReorganizeTranscript },
                    { text: '多人面试', onPress: onReorganizeTranscriptAsGroup },
                  ],
                )}><Text style={styles.inlineEditButtonText}>{transcriptOrganizationPaused ? '继续整理' : '重新完整整理'}</Text></Pressable>
              </View>
            ) : (
              <Pressable style={styles.qaOrganizationEmpty} onPress={() => Alert.alert(
                '选择整理方式',
                '普通面试按问答整理；多人面试按议题、面试官和候选人整理。',
                [
                  { text: '取消', style: 'cancel' },
                  { text: '普通面试', onPress: onOrganizeTranscript },
                  { text: '多人面试', onPress: onReorganizeTranscriptAsGroup },
                ],
              )}>
                <AppIcon name="sparkles" size={20} color="#7C3AED" />
                <View style={styles.flexOne}><Text style={styles.rowTitle}>整理全部对话</Text><Text style={styles.rowDetail}>普通问答或多人面试议题均保留时间与原音核对</Text></View>
              </Pressable>
            )}
          </View>
          <CollapsibleGroup title={`原始转写 · ${transcriptSegments.length} 段`}>
          {() => <>
          <View style={styles.transcriptTools}>
            <View style={styles.transcriptSearchBox}>
              <AppIcon name="search" size={18} color="#6B7280" />
              <TextInput style={styles.transcriptSearchInput} value={transcriptQuery} onChangeText={setTranscriptQuery} placeholder="搜索转写" placeholderTextColor="#9CA3AF" />
            </View>
            <Pressable accessibilityLabel="复制全部转写" style={styles.transcriptToolButton} onPress={() => { void Clipboard.setStringAsync(transcript); }}>
              <AppIcon name="copy" size={19} color="#4B5563" />
            </Pressable>
            <Pressable accessibilityLabel="删除转写" style={styles.transcriptToolButton} onPress={() => Alert.alert('删除转写', '只删除转写文本，录音和 AI 复盘将保留。', [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => { onTranscriptChange(''); setTranscriptQuery(''); } },
            ])}>
              <AppIcon name="trash" size={19} color="#B45353" />
            </Pressable>
            <Pressable style={styles.inlineEditButton} onPress={() => { animateNextLayout(); setIsEditingTranscript((value) => !value); }}>
              <Text style={styles.inlineEditButtonText}>{isEditingTranscript ? '完成' : '编辑'}</Text>
            </Pressable>
          </View>
          {isEditingTranscript ? (
            <TextInput multiline style={styles.textArea} textAlignVertical="top" value={transcript} onChangeText={onTranscriptChange} />
          ) : visibleTranscriptSegments.length ? visibleTranscriptSegments.map((segment) => {
              const index = segment.sourceIndex;
              const isLong = segment.text.length > 300;
              const expanded = Boolean(expandedTranscriptSegments[index]);
              return (
                <Pressable
                  key={`${segment.startSeconds}-${index}`}
                  style={[
                    styles.transcriptSegment,
                    activeTranscriptSegmentIndex === index && styles.transcriptSegmentActive,
                  ]}
                  onLongPress={() => Alert.alert('转写片段', segment.timeLabel, [
                    { text: '取消', style: 'cancel' },
                    { text: '复制该段', onPress: () => { void Clipboard.setStringAsync(segment.text); } },
                    {
                      text: '删除该段',
                      style: 'destructive',
                      onPress: () => onTranscriptChange(removeTranscriptSegment(transcript, segment)),
                    },
                  ])}
                  delayLongPress={350}
                  accessibilityHint="点击波形定位录音，长按管理该转写片段"
                >
                  <View style={styles.transcriptSegmentHeader}>
                    <View style={styles.transcriptSegmentIdentity}>
                      <Text style={styles.transcriptSegmentIndex}>{index + 1}</Text>
                      <Text style={styles.transcriptSpeaker}>{segment.speaker}</Text>
                    </View>
                    <View style={styles.transcriptSegmentTools}>
                      <TranscriptWaveButton
                        timeLabel={segment.timeLabel}
                        isActive={activeTranscriptSegmentIndex === index}
                        isPlaying={activeTranscriptSegmentIndex === index && isPlaying}
                        isLoading={playbackRequestState === 'loading' && playbackTargetSeconds !== null && Math.abs(playbackTargetSeconds - segment.startSeconds) < 0.75}
                        disabled={!segment.canSeek || !savedAudioUri}
                        onPress={(event) => {
                          event.stopPropagation();
                          onPlayAtPlayback(segment.startSeconds);
                        }}
                      />
                      <Pressable
                        accessibilityLabel={`复制第 ${index + 1} 段转写`}
                        style={styles.transcriptCopyAction}
                        onPress={(event) => {
                          event.stopPropagation();
                          void Clipboard.setStringAsync(segment.text);
                        }}
                      >
                        <AppIcon name="copy" size={16} color="#8A918D" />
                      </Pressable>
                    </View>
                  </View>
                  <HighlightedTranscript text={segment.text} keywords={transcriptKeywords} numberOfLines={isLong && !expanded ? 3 : undefined} />
                  {isLong ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        animateNextLayout();
                        setExpandedTranscriptSegments((current) => ({ ...current, [index]: !expanded }));
                      }}
                    >
                      <Text style={styles.expandTranscript}>{expanded ? '收起' : '展开全文'}</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            }) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>还没有转写文本。先在“录音”中完成转写，或展开下方原始转写手动补充。</Text>
              </View>
            )}
          </>}
          </CollapsibleGroup>
          </> : null}
          {reviewContentView === 'evidence' && !transcript.trim() ? (
            <View style={styles.transcriptEmptyDocument}>
              <AppIcon name="interviews" size={26} color="#8A918D" />
              <Text style={styles.rowTitle}>还没有对话记录</Text>
              <Text style={styles.emptyStateText}>先在“录音”中完成转写，完成后会在这里按问题和时间整理。</Text>
            </View>
          ) : null}
          {reviewContentView === 'overview' && hasReviewContent ? <InterviewReviewOverview
            headline={reviewHeadline}
            body={reviewOverviewBody}
            metrics={[
              { value: String(reviewQuestionDetails.length || transcriptQaPairs.length), label: '核心问题' },
              { value: String(reviewActionItems.length), label: '行动建议' },
              { value: reviewAverageScore, label: '综合表现', onPress: reviewScoreEntries.length ? () => setShowReviewScores(true) : undefined },
            ]}
            progress={[
              { icon: 'record', title: '原始录音', detail: savedAudioUri ? `${formatDuration(Math.floor(playbackDuration || savedAudioDurationMillis / 1000))} · 本地保存` : '未保存', complete: Boolean(savedAudioUri) },
              { icon: 'interviews', title: '逐段转写', detail: transcriptionState === 'completed' ? '完整 · 可定位原音' : transcriptionState === 'processing' ? '正在转写' : '待完成', complete: transcriptionState === 'completed' },
              { icon: 'sparkles', title: '结构化复盘', detail: '已生成 · 可编辑', complete: true },
            ]}
            onOpenEvidence={transcript.trim() ? () => setReviewContentView('evidence') : undefined}
          /> : null}
          {reviewContentView === 'review' && hasReviewContent ? <View style={styles.hrDemoSectionStack}>
            <View style={styles.preparationSectionHeader}>
              <Text style={styles.groupTitle}>深度复盘</Text>
              {!isEditingReview && !reviewGenerationError ? <Pressable style={styles.inlineEditButton} disabled={Boolean(aiBusy)} onPress={() => Alert.alert(
                '重新生成复盘？', '会再次调用模型并消耗额度，成功后替换旧复盘，失败时保留旧内容。', [
                  { text: '取消', style: 'cancel' },
                  { text: '重新生成', onPress: onReview },
                ], { cancelable: true },
              )}><Text style={styles.inlineEditButtonText}>重新生成</Text></Pressable> : null}
              <Pressable style={styles.inlineEditButton} disabled={reviewGenerationState === 'processing'} onPress={() => setIsEditingReview((value) => !value)}><Text style={styles.inlineEditButtonText}>{isEditingReview ? '完成' : '编辑'}</Text></Pressable>
            </View>
            {isEditingReview ? <View style={styles.reviewEditor}>
              <PreparationTextArea label="总体判断" value={reviewOverall} onChangeText={onReviewOverallChange} placeholder="记录你对本轮表现的真实判断" />
              <Text style={styles.characterCount}>{reviewOverall.length}/500</Text>
              <PreparationTextArea label="核心优点" value={reviewStrengths} onChangeText={onReviewStrengthsChange} placeholder="记录有证据支撑的优势" />
              <Text style={styles.characterCount}>{reviewStrengths.length}/500</Text>
              <PreparationTextArea label="主要风险" value={reviewRisks} onChangeText={onReviewRisksChange} placeholder="记录回答漏洞、岗位风险和后续验证点" />
              <Text style={styles.characterCount}>{reviewRisks.length}/500</Text>
              <Pressable haptic="light" style={styles.primaryButton} onPress={() => setIsEditingReview(false)}><Text style={styles.primaryButtonText}>保存复盘</Text></Pressable>
              <Pressable style={styles.reviewDeleteAction} onPress={() => Alert.alert('删除 AI 复盘', '转写和录音将保留，可随时重新生成复盘。', [
                { text: '取消', style: 'cancel' },
                { text: '删除', style: 'destructive', onPress: () => {
                  onClearReview();
                  setIsEditingReview(false);
                } },
              ])}>
                <AppIcon name="trash" size={17} color="#B45353" />
                <Text style={styles.audioDeleteAction}>删除 AI 复盘</Text>
              </Pressable>
            </View> : <View style={styles.hrDemoSectionStack}>
              {reviewStrengths ? <View style={styles.hrDemoPlainSection}>
                <Text style={styles.hrDemoSectionTitle}>做得好的地方</Text>
                <Text style={styles.hrDemoBody}>{reviewStrengths}</Text>
              </View> : null}
              {reviewRisks ? <View style={styles.hrDemoPlainSection}>
                <Text style={styles.hrDemoSectionTitle}>需要改进</Text>
                <Text style={styles.hrDemoBody}>{reviewRisks}</Text>
              </View> : null}
            </View>}
          </View> : null}
          {reviewContentView === 'review' && !hasReviewContent ? (
            <Pressable style={styles.aiReviewEmptyCard} onPress={() => setReviewContentView('overview')}>
              <AppIcon name="sparkles" size={26} color="#7C3AED" />
              <Text style={styles.aiReviewEmptyTitle}>还没有深度复盘</Text>
              <Text style={styles.emptyStateText}>返回概览生成后，再查看优势、风险和行动建议。</Text>
            </Pressable>
          ) : null}
          {reviewContentView === 'review' && hasReviewContent && (reviewProgressComparedWithPast || reviewRecurringPatterns.length || reviewQuestionDetails.length) ? (
            <CollapsibleGroup title="详细分析">
              {() => <>
                {reviewProgressComparedWithPast || reviewRecurringPatterns.length ? <View style={styles.reviewSubsection}>
                  <Text style={styles.transcriptSectionTitle}>长期变化</Text>
                  {reviewProgressComparedWithPast ? <ReviewBlock tone="success" title="相比以往" body={reviewProgressComparedWithPast} /> : null}
                  {reviewRecurringPatterns.length ? <ReviewBlock tone="risk" title="重复出现" body={reviewRecurringPatterns.join('\n')} /> : null}
                </View> : null}
                {reviewQuestionDetails.length ? <View style={styles.reviewSubsection}>
                  <Text style={styles.transcriptSectionTitle}>逐题复盘</Text>
                  {reviewQuestionDetails.map((item, index) => (
                    <View style={styles.questionReviewCard} key={`${item.question}-${index}`}>
                      <View style={styles.questionReviewHeader}>
                        <Text style={styles.questionReviewTitle}>{item.question}</Text>
                        <Text style={styles.questionReviewScore} numberOfLines={1}>{item.score}/5</Text>
                      </View>
                      {item.answerSummary ? <Text style={styles.paragraph}>{item.answerSummary}</Text> : null}
                      {item.feedback ? <Text style={styles.questionReviewFeedback}>{item.feedback}</Text> : null}
                      {item.evidenceTime ? <Pressable style={styles.evidenceButton} onPress={() => onPlayAtPlayback(parseTranscriptTimestamp(item.evidenceTime))}><Text style={styles.evidenceButtonText}>定位录音 {item.evidenceTime}</Text></Pressable> : null}
                    </View>
                  ))}
                </View> : null}
              </>}
            </CollapsibleGroup>
          ) : null}
          {reviewContentView === 'review' && hasReviewContent && reviewActionItems.length ? (
            <CollapsibleGroup title="行动清单">
              {() => <>{reviewActionItems.map((item, index) => {
                const added = preparationMaterials.some((material) => normalizeText(material.body) === normalizeText(item));
                return (
                  <View style={styles.reviewActionRow} key={`${item}-${index}`}>
                    <AppIcon name="check" size={17} color="#1D4ED8" />
                    <Text style={[styles.paragraph, styles.flexOne]}>{item}</Text>
                    <Pressable haptic="selection" disabled={added} style={[styles.reviewActionAdd, added && styles.reviewActionAddDone]} onPress={() => addReviewActionToPreparation(item, index)}>
                      <Text style={[styles.reviewActionAddText, added && styles.reviewActionAddTextDone]}>{added ? '已加入' : '加入准备'}</Text>
                    </Pressable>
                  </View>
                );
              })}</>}
            </CollapsibleGroup>
          ) : null}
          {reviewContentView === 'review' && (hasReviewContent || manualQuestions.trim() || improvedAnswer.trim()) ? <CollapsibleGroup title="补充与改写">
            <View style={styles.reviewSubsection}>
              <Text style={styles.formLabel}>补充问题</Text>
              <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={manualQuestions} onChangeText={onManualQuestionsChange} placeholder="一行记录一个面试问题" placeholderTextColor="#8A918D" />
            </View>
            <View style={styles.reviewSubsection}>
              <Text style={styles.formLabel}>改进回答</Text>
              <TextInput multiline style={styles.textArea} textAlignVertical="top" value={improvedAnswer} onChangeText={onImprovedAnswerChange} placeholder="把回答不好的问题改写成下一次可复用的版本" />
            </View>
          </CollapsibleGroup> : null}
        </>
      )}
      {section === 'followup' && (
        <>
          <Group title="提醒">
            <View style={styles.sectionBody}>
              <Pressable style={styles.reminderPickerButton} onPress={() => setShowReminderPicker(true)}>
                <AppIcon name="calendar" size={20} color="#6B7280" />
                <View style={styles.flexOne}><Text style={styles.formLabel}>提醒时间</Text><Text style={reminderAt ? styles.rowTitle : styles.rowDetail}>{reminderAt || '选择日期和时间'}</Text></View>
                <AppIcon name="chevron" size={18} color="#9CA3AF" />
              </Pressable>
            </View>
          </Group>
          <Group title="跟进记录">
            <View style={styles.followUpComposer}>
              <TextInput multiline style={styles.followUpInput} textAlignVertical="top" value={followUpDraft} onChangeText={setFollowUpDraft} placeholder="追加感谢邮件、反馈进度或沟通记录" placeholderTextColor="#8A918D" />
              <Pressable style={[styles.followUpAddButton, !followUpDraft.trim() && styles.buttonDisabled]} disabled={!followUpDraft.trim()} onPress={appendFollowUpRecord}><Text style={styles.primaryButtonText}>添加记录</Text></Pressable>
            </View>
            {followUpRecords.length ? followUpRecords.map((record, index) => (
              <View style={styles.followUpTimelineItem} key={`${record.time}-${index}`}>
                <View style={styles.followUpDot} />
                <View style={styles.flexOne}><Text style={styles.rowTitle}>{record.body}</Text><Text style={styles.rowDetail}>{record.time}</Text></View>
              </View>
            )) : <View style={styles.emptyState}><Text style={styles.emptyStateText}>还没有跟进记录。</Text></View>}
          </Group>
          <ReminderDateTimePicker
            visible={showReminderPicker}
            value={reminderDate}
            onClose={() => setShowReminderPicker(false)}
            onConfirm={handleReminderValueChange}
          />
        </>
      )}
      <SheetScaffold
        visible={showResultPicker}
        title="面试结果"
        subtitle="结果会同步到待办和职位进度"
        onClose={() => setShowResultPicker(false)}
      >
        {interviewResultOptions.map((option) => (
          <Pressable
            key={option}
            style={styles.settingsStatusOption}
            onPress={() => {
              onResultChange(option);
              setShowResultPicker(false);
            }}
          >
            <Text style={styles.rowTitle}>{option}</Text>
            {result === option ? <AppIcon name="check" size={19} color="#047857" /> : null}
          </Pressable>
        ))}
      </SheetScaffold>
      <SheetScaffold
        visible={showReviewScores}
        title="能力评分"
        subtitle={`综合表现 ${reviewAverageScore} / 5`}
        onClose={() => setShowReviewScores(false)}
      >
        <View style={styles.reviewScoreSheetSummary}>
          <Text style={styles.reviewScoreSheetValue}>{reviewAverageScore}</Text>
          <Text style={styles.reviewScoreSheetScale}>满分 5 分</Text>
        </View>
        <View style={styles.reviewScoreSheetList}>
          {Object.entries(reviewScores).map(([label, score]) => (
            <View style={styles.reviewScoreSheetRow} key={label}>
              <View style={styles.reviewScoreSheetHeader}>
                <Text style={styles.rowTitle}>{label}</Text>
                <Text style={styles.reviewScoreSheetNumber}>{score}/5</Text>
              </View>
              <View style={styles.reviewScoreTrack}>
                <View style={[styles.reviewScoreFill, { width: `${Math.max(0, Math.min(100, score * 20))}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </SheetScaffold>
      <SheetScaffold
        visible={showInterviewExport}
        title="导出面试记录"
        subtitle="生成一份可继续编辑的 Markdown 文档"
        onClose={() => setShowInterviewExport(false)}
        footer={(
          <Pressable haptic="light" style={[styles.primaryButton, interviewExportBusy && styles.buttonDisabled]} disabled={interviewExportBusy} onPress={() => { void exportCurrentInterview(); }}>
            <AppIcon name="upload" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{interviewExportBusy ? '正在生成…' : '导出文档'}</Text>
          </Pressable>
        )}
      >
            <Text style={styles.formLabel}>导出内容</Text>
            <View style={styles.exportChoiceRow}>
              {([
                { value: 'summary' as const, label: '复盘笔记' },
                { value: 'transcript' as const, label: '对话记录' },
                { value: 'all' as const, label: '全部' },
              ]).map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.exportChoice, interviewExportContent === option.value && styles.exportChoiceActive]}
                  onPress={() => setInterviewExportContent(option.value)}
                >
                  <Text style={[styles.exportChoiceText, interviewExportContent === option.value && styles.exportChoiceTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.exportToggleRow} onPress={() => setExportWithTimestamps((value) => !value)}>
              <View style={[styles.selectionBox, exportWithTimestamps && styles.selectionBoxActive]}>
                {exportWithTimestamps ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle}>显示时间戳</Text>
                <Text style={styles.rowDetail}>保留逐题和原文对应的音频位置</Text>
              </View>
            </Pressable>
      </SheetScaffold>
      <SheetScaffold
        visible={Boolean(materialEditor)}
        title={isNewMaterial ? '添加准备材料' : '编辑准备材料'}
        onClose={() => setMaterialEditor(null)}
        footer={(
          <ResponsiveRow>
            <Pressable style={[styles.secondaryButton, styles.flexOne]} onPress={() => setMaterialEditor(null)}>
              <Text style={styles.secondaryButtonText}>取消</Text>
            </Pressable>
            {!isNewMaterial ? (
              <Pressable
                style={[styles.destructiveButton, styles.flexOne]}
                onPress={() => {
                  if (materialEditor) {
                    onPreparationMaterialsChange(preparationMaterials.filter((item) => item.id !== materialEditor.id));
                  }
                  setMaterialEditor(null);
                }}
              >
                <Text style={styles.destructiveButtonText}>删除</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.primaryButton, styles.flexOne]} onPress={saveMaterial}>
              <Text style={styles.primaryButtonText}>保存</Text>
            </Pressable>
          </ResponsiveRow>
        )}
      >
            <Text style={styles.formLabel}>材料类型</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.materialTypeRow}>
              {preparationMaterialTemplates.map((template) => (
                <FilterChip
                  key={template.kind}
                  label={template.label}
                  active={materialEditor?.kind === template.kind}
                  onPress={() => applyMaterialTemplate(template.kind)}
                />
              ))}
            </ScrollView>
            <FormInput
              label="标题"
              value={materialEditor?.title ?? ''}
              onChangeText={(title) => setMaterialEditor((current) => (current ? { ...current, title } : current))}
              placeholder="材料标题"
            />
            <View style={styles.formField}>
              <Text style={styles.formLabel}>内容</Text>
              <TextInput
                multiline
                textAlignVertical="top"
                style={styles.longNoteArea}
                value={materialEditor?.body ?? ''}
                onChangeText={(body) => setMaterialEditor((current) => (current ? { ...current, body } : current))}
                placeholder="记录面试前需要快速查看的内容"
              />
            </View>
            <Text style={styles.formLabel}>优先级</Text>
            <View style={styles.compactActionRow}>
              <FilterChip
                label="普通"
                active={materialEditor?.importance === 'normal'}
                onPress={() => setMaterialEditor((current) => (current ? { ...current, importance: 'normal' } : current))}
              />
              <FilterChip
                label="重点"
                active={materialEditor?.importance === 'high'}
                onPress={() => setMaterialEditor((current) => (current ? { ...current, importance: 'high' } : current))}
              />
            </View>
      </SheetScaffold>
    </>
  );
}

function InterviewsScreen({
  interviews,
  allJobs,
  search,
  onSearchChange,
  selectedInterviewId,
  setSelectedInterviewId,
  durationText,
  isRecording,
  savedAudioUri,
  savedAudioName,
  audioWorkState,
  result,
  playbackCurrentTime,
  playbackDuration,
  isPlaying,
  transcript,
  note,
  interviewerName,
  interviewerTitle,
  endAt,
  manualQuestions,
  improvedAnswer,
  questionsForInterviewer,
  followUpAction,
  reminderAt,
  checklistDone,
  onShowCompliance,
  onPause,
  onStop,
  onUpload,
  onTogglePlayback,
  onResultChange,
  onKeepOnly,
  onTranscribe,
  onReview,
  onTranscriptChange,
  onNoteChange,
  onQuestionsChange,
  onFollowUpActionChange,
  onInterviewerNameChange,
  onInterviewerTitleChange,
  onEndAtChange,
  onManualQuestionsChange,
  onImprovedAnswerChange,
  onReminderAtChange,
  onToggleChecklistItem,
  onDeleteAudio,
  onDeleteInterview,
  onCreateInterview,
  onOpenJob,
}: {
  interviews: Interview[];
  allJobs: Job[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedInterviewId: number;
  setSelectedInterviewId: (id: number) => void;
  durationText: string;
  isRecording: boolean;
  savedAudioUri: string | null;
  savedAudioName: string | null;
  audioWorkState: AudioWorkState;
  result: InterviewResult;
  playbackCurrentTime: number;
  playbackDuration: number;
  isPlaying: boolean;
  transcript: string;
  note: string;
  interviewerName: string;
  interviewerTitle: string;
  endAt: string;
  manualQuestions: string;
  improvedAnswer: string;
  questionsForInterviewer: string;
  followUpAction: string;
  reminderAt: string;
  checklistDone: Record<string, boolean>;
  onShowCompliance: () => void;
  onPause: () => void;
  onStop: () => void;
  onUpload: () => void;
  onTogglePlayback: () => void;
  onResultChange: (result: InterviewResult) => void;
  onKeepOnly: () => void;
  onTranscribe: () => void;
  onReview: () => void;
  onTranscriptChange: (text: string) => void;
  onNoteChange: (text: string) => void;
  onQuestionsChange: (text: string) => void;
  onFollowUpActionChange: (text: string) => void;
  onInterviewerNameChange: (text: string) => void;
  onInterviewerTitleChange: (text: string) => void;
  onEndAtChange: (text: string) => void;
  onManualQuestionsChange: (text: string) => void;
  onImprovedAnswerChange: (text: string) => void;
  onReminderAtChange: (text: string) => void;
  onToggleChecklistItem: (item: string) => void;
  onDeleteAudio: () => void;
  onDeleteInterview: (interview: Interview) => void;
  onCreateInterview: () => void;
  onOpenJob: (jobId: number) => void;
}) {
  const selectedInterview =
    interviews.find((interview) => interview.id === selectedInterviewId) ?? interviews[0];
  if (!selectedInterview) {
    return (
      <>
        <TextInput
          style={styles.searchInput}
          placeholderTextColor="#8A918D"
          value={search}
          onChangeText={onSearchChange}
          placeholder="搜索公司、岗位、轮次、时间"
        />
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>没有匹配的面试记录。</Text>
        </View>
      </>
    );
  }
  const linkedJob = allJobs.find((job) => job.id === selectedInterview.jobId);

  return (
    <>
      <TextInput
        style={styles.searchInput}
        placeholderTextColor="#8A918D"
        value={search}
        onChangeText={onSearchChange}
        placeholder="搜索公司、岗位、轮次、时间"
      />
      <View style={styles.stateBanner}>
        <Text style={styles.stateBannerText} onPress={onCreateInterview}>
          点右上角 + 可以新增面试记录。
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller}>
        {interviews.map((interview) => (
          <Pressable
            key={interview.id}
            style={[
              styles.interviewChip,
              interview.id === selectedInterviewId && styles.interviewChipActive,
            ]}
            onPress={() => setSelectedInterviewId(interview.id)}
          >
            <Text style={styles.chipTitle}>{interview.company}</Text>
            <Text style={styles.chipDetail}>
              {interview.round} · {interview.audioState}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.detailHeader}>
        <Text style={styles.kicker}>{selectedInterview.status}</Text>
        <Text style={styles.heroTitle}>{selectedInterview.company}</Text>
        <Text style={styles.mutedText}>
          {selectedInterview.title} / {selectedInterview.round} / {formatInterviewSchedule(selectedInterview.startsAt, selectedInterview.id)}
        </Text>
        {linkedJob ? (
          <Pressable style={styles.linkedJobBox} onPress={() => onOpenJob(linkedJob.id)}>
            <View style={styles.flexOne}>
              <Text style={styles.linkedJobTitle}>关联职位</Text>
              <Text style={styles.rowDetail}>
                {linkedJob.company} · {linkedJob.title} · {linkedJob.platform}
              </Text>
            </View>
            <AppIcon name="chevron" size={18} color="#9CA3AF" />
          </Pressable>
        ) : null}
        <View style={styles.jobActionRow}>
          <Pressable style={styles.destructiveButton} onPress={() => onDeleteInterview(selectedInterview)}>
            <Text style={styles.destructiveButtonText}>删除面试</Text>
          </Pressable>
        </View>
      </View>
      <Group title="面试信息">
        <View style={styles.jobDetailPanel}>
          <FormInput
            label="面试官姓名"
            value={interviewerName}
            onChangeText={onInterviewerNameChange}
            placeholder="可选"
          />
          <FormInput
            label="面试官职位"
            value={interviewerTitle}
            onChangeText={onInterviewerTitleChange}
            placeholder="HR / 技术主管 / 业务负责人"
          />
          <FormInput
            label="结束时间"
            value={endAt}
            onChangeText={onEndAtChange}
            placeholder="例如：今天 16:20"
          />
        </View>
      </Group>
      <Group title="面试结果">
        <View style={styles.compactActionRow}>
          {interviewResultOptions.map((option) => {
            const active = result === option;
            return (
              <Pressable
                key={option}
                style={[styles.resultButton, active && styles.resultButtonActive]}
                onPress={() => onResultChange(option)}
              >
                <Text style={[styles.resultButtonText, active && styles.resultButtonTextActive]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group title="面试准备">
        <View style={styles.sectionBody}>
          <Text style={styles.paragraph}>{selectedInterview.jdSummary}</Text>
        </View>
        {selectedInterview.checklist.map((item) => (
          <Pressable style={styles.checkRow} key={item} onPress={() => onToggleChecklistItem(item)}>
            <Text style={[styles.checkMark, checklistDone[item] && styles.checkMarkDone]}>
              <AppIcon name={checklistDone[item] ? 'check' : 'circle'} size={18} color={checklistDone[item] ? '#047857' : '#9CA3AF'} />
            </Text>
            <View style={styles.flexOne}>
              <Text style={[styles.rowTitle, checklistDone[item] && styles.doneText]}>{item}</Text>
              <Text style={styles.rowDetail}>{checklistDone[item] ? '已准备' : '待准备'}</Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.sectionBody}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>反问与关注点</Text>
            <TextInput
              multiline
              style={styles.noteArea}
              textAlignVertical="top"
              value={questionsForInterviewer}
              onChangeText={onQuestionsChange}
              placeholder="记录要问面试官的问题、想确认的团队/业务/薪资信息"
            />
          </View>
        </View>
      </Group>
      <View style={styles.recorderPanel}>
        <View style={[styles.recordCircle, isRecording && styles.recordCircleActive]}>
          <Text style={styles.recordDuration}>{durationText}</Text>
          <Text style={styles.recordLabel}>{isRecording ? '录音中' : savedAudioUri ? '已保存' : '待录音'}</Text>
        </View>
        <Text style={styles.recorderHint}>
          面试录音只在你点击开始后申请权限。结束后先本地保存，再由你决定是否转写或分析。
        </Text>
        <View style={styles.actionRow}>
          {!isRecording && (
            <Pressable style={styles.primaryButton} onPress={onShowCompliance}>
              <Text style={styles.primaryButtonText}>开始录音</Text>
            </Pressable>
          )}
          {isRecording && (
            <>
              <Pressable style={styles.secondaryButton} onPress={onPause}>
                <Text style={styles.secondaryButtonText}>暂停</Text>
              </Pressable>
              <Pressable style={styles.destructiveButton} onPress={onStop}>
                <Text style={styles.destructiveButtonText}>停止并保存</Text>
              </Pressable>
            </>
          )}
          <Pressable style={styles.secondaryButton} onPress={onUpload}>
            <Text style={styles.secondaryButtonText}>上传录音</Text>
          </Pressable>
        </View>
        {savedAudioUri && (
          <View style={styles.savedAudioBox}>
            <Text style={styles.rowTitle}>本地音频已就绪</Text>
            <Text style={styles.rowDetail}>{savedAudioName}</Text>
            <View style={styles.playbackRow}>
              <View style={styles.playbackMeta}>
                <Text style={styles.rowTitle}>回放核对</Text>
                <Text style={styles.rowDetail}>
                  {formatDuration(Math.floor(playbackCurrentTime || 0))} / {formatDuration(Math.floor(playbackDuration || 0))}
                </Text>
              </View>
              <Pressable style={styles.playbackButton} onPress={onTogglePlayback}>
                <Text style={styles.playbackButtonText}>{isPlaying ? '暂停' : '播放'}</Text>
              </Pressable>
            </View>
            <Text style={styles.rowDetail}>{getAudioStateText(audioWorkState)}</Text>
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={onKeepOnly}>
                <Text style={styles.secondaryButtonText}>仅保存</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={onTranscribe}>
                <Text style={styles.secondaryButtonText}>转写</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={onReview}>
                <Text style={styles.primaryButtonText}>转写并分析</Text>
              </Pressable>
              <Pressable style={styles.destructiveButton} onPress={onDeleteAudio}>
                <Text style={styles.destructiveButtonText}>删除录音</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
      {audioWorkState === 'transcribed' || audioWorkState === 'reviewed' ? (
        <View style={styles.stateBanner}>
          <Text style={styles.stateBannerText}>
            {audioWorkState === 'reviewed' ? '已生成基础复盘，结果可继续编辑。' : '已生成转写文本，请先校对再分析。'}
          </Text>
        </View>
      ) : null}
      <Group title="转写文本">
        <TextInput
          multiline
          style={styles.textArea}
          textAlignVertical="top"
          value={transcript}
          onChangeText={onTranscriptChange}
        />
      </Group>
      <Group title="面试问题">
        <TextInput
          multiline
          style={styles.noteArea}
          textAlignVertical="top"
          value={manualQuestions}
          onChangeText={onManualQuestionsChange}
          placeholder="手动记录面试官问过的问题，一行一个也可以。"
        />
      </Group>
      <Group title="基础复盘">
        <ReviewBlock title="总体判断" body={reviewSeed.overall} />
        <ReviewBlock title="核心优点" body={reviewSeed.strengths} />
        <ReviewBlock title="主要风险" body={reviewSeed.risks} />
        <ReviewBlock title="下一步建议" body="把本轮被追问的问题整理成 2-3 个可复用回答，补充真实指标、边界条件和失败处理。若三天内未收到反馈，优先发送简短跟进消息。" />
      </Group>
      <Group title="问题摘要">
        {extractInterviewQuestions(manualQuestions, transcript).length ? (
          extractInterviewQuestions(manualQuestions, transcript).map((question, index) => (
            <ListRow key={`${question}-${index}`} title={`问题 ${index + 1}`} detail={question} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>还没有可整理的问题。</Text>
          </View>
        )}
      </Group>
      <Group title="改进回答">
        <TextInput
          multiline
          style={styles.textArea}
          textAlignVertical="top"
          value={improvedAnswer}
          onChangeText={onImprovedAnswerChange}
          placeholder="把这场面试中回答不好的问题，改写成下一次可复用的版本。"
        />
      </Group>
      <Group title="后续动作">
        <View style={styles.sectionBody}>
          <FormInput
            label="提醒时间"
            value={reminderAt}
            onChangeText={onReminderAtChange}
            placeholder="例如：周五 10:00 / 3 天后"
          />
          <TextInput
            multiline
            style={styles.noteArea}
            textAlignVertical="top"
            value={followUpAction}
            onChangeText={onFollowUpActionChange}
            placeholder="例如：今晚补感谢邮件；三天后跟进反馈；补充作品集链接"
          />
        </View>
      </Group>
      <Group title="快速备注">
        <TextInput
          multiline
          style={styles.noteArea}
          textAlignVertical="top"
          value={note}
          onChangeText={onNoteChange}
        />
      </Group>
    </>
  );
}

function ComplianceModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <SheetScaffold
      visible={visible}
      title="录音合规确认"
      onClose={onCancel}
      footer={(
        <ResponsiveRow compactAt={280}>
          <Pressable style={[styles.secondaryButton, styles.flexOne]} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, styles.flexOne]} onPress={onConfirm}>
            <Text style={styles.primaryButtonText}>确认并开始</Text>
          </Pressable>
        </ResponsiveRow>
      )}
    >
      <Text style={styles.paragraph}>
        请确认你已获得相关参与方同意，或确认该录音行为符合你所在地法律法规及平台规则。录音内容仅用于你的个人面试复盘，你可以随时删除录音文件。
      </Text>
    </SheetScaffold>
  );
}

function EndReasonModal({
  visible,
  job,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  job: Job | null;
  onCancel: () => void;
  onConfirm: (reason: EndReason) => void;
}) {
  return (
    <SheetScaffold visible={visible} title="选择结束原因" onClose={onCancel}>
      <Text style={styles.paragraph}>
        {job ? `${job.company} · ${job.title}` : '当前职位'} 将标记为已结束，原因会进入复盘数据。
      </Text>
      <View style={styles.filterRowWrap}>
        {endReasonOptions.map((reason) => (
          <Pressable style={styles.resultButton} key={reason} onPress={() => onConfirm(reason)}>
            <Text style={styles.resultButtonText}>{reason}</Text>
          </Pressable>
        ))}
      </View>
    </SheetScaffold>
  );
}

function BatchResearchModal({
  visible,
  jobs,
  selectedIds,
  progress,
  onToggle,
  onSelectAll,
  onClear,
  onStart,
  onCancel,
  onClose,
}: {
  visible: boolean;
  jobs: Job[];
  selectedIds: number[];
  progress: BatchResearchProgress;
  onToggle: (jobId: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const running = progress.status === 'running';
  return (
    <SheetScaffold
      visible={visible}
      title="批量公司调研"
      subtitle="一次选择，后台按岗位串行读取并汇总"
      onClose={onClose}
      footer={!running ? (
        <Pressable style={[styles.primaryButton, !selectedIds.length && styles.buttonDisabled]} disabled={!selectedIds.length} onPress={onStart}>
          <Text style={styles.primaryButtonText}>{progress.status === 'failed' ? '从未完成岗位重试' : selectedIds.length ? `开始调研 ${selectedIds.length} 个岗位` : '开始调研'}</Text>
        </Pressable>
      ) : <Text style={styles.rowDetail}>可以关闭窗口继续使用应用，完成后会自动保存到职位。</Text>}
    >
            {running || progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled' ? (
              <View style={styles.researchProgressPanel}>
                <Text style={styles.rowTitle}>{running ? `正在处理 ${progress.completedJobs}/${progress.totalJobs}` : progress.status === 'completed' ? '调研完成' : '调研已暂停'}</Text>
                <Text style={styles.rowDetail}>{progress.detail}</Text>
                {running ? (
                  <Pressable style={styles.smallSecondaryButton} onPress={onCancel}>
                    <Text style={styles.smallSecondaryButtonText}>停止调研</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {!running ? (
              <View style={styles.batchSelectionActions}>
                <Pressable style={styles.smallSecondaryButton} onPress={onSelectAll}>
                  <Text style={styles.smallSecondaryButtonText}>选择当前列表</Text>
                </Pressable>
                <Pressable style={styles.smallSecondaryButton} onPress={onClear}>
                  <Text style={styles.smallSecondaryButtonText}>清空</Text>
                </Pressable>
                <Text style={styles.rowDetail}>已选 {selectedIds.length}</Text>
              </View>
            ) : null}

            <View style={styles.batchResearchList}>
              {jobs.map((job) => {
                const selected = selectedIds.includes(job.id);
                const current = progress.currentJobId === job.id;
                return (
                  <Pressable
                    key={job.id}
                    style={[styles.batchResearchRow, selected && styles.batchResearchRowSelected]}
                    disabled={running}
                    onPress={() => onToggle(job.id)}
                  >
                    <View style={[styles.selectionBox, selected && styles.selectionBoxActive]}>
                      {selected ? <AppIcon name="check" size={15} color="#FFFFFF" /> : null}
                    </View>
                    <View style={styles.flexOne}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{job.company}</Text>
                      <Text style={styles.rowDetail} numberOfLines={1}>{job.title}</Text>
                    </View>
                    {current ? <Text style={styles.researchCurrentLabel}>处理中</Text> : null}
                  </Pressable>
                );
              })}
            </View>
    </SheetScaffold>
  );
}

function JobFiltersModal({
  visible,
  jobs,
  values,
  dateBasis,
  dateRange,
  onChangePlatform,
  onChangeCity,
  onChangeResume,
  onChangeDateBasis,
  onChangeDateRange,
  onReset,
  onClose,
}: {
  visible: boolean;
  jobs: Job[];
  values: { platform: string; city: string; resume: string };
  dateBasis: JobDateBasis;
  dateRange: DateRangeValue;
  onChangePlatform: (value: string) => void;
  onChangeCity: (value: string) => void;
  onChangeResume: (value: string) => void;
  onChangeDateBasis: (value: JobDateBasis) => void;
  onChangeDateRange: (value: DateRangeValue) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <SheetScaffold
      visible={visible}
      title="职位筛选"
      onClose={onClose}
      footer={(
        <ResponsiveRow compactAt={280}>
          <Pressable style={[styles.secondaryButton, styles.flexOne]} onPress={onReset}>
            <Text style={styles.secondaryButtonText}>重置</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, styles.flexOne]} onPress={onClose}>
            <Text style={styles.primaryButtonText}>完成</Text>
          </Pressable>
        </ResponsiveRow>
      )}
    >
          <FilterOptionGroup
            title="平台"
            values={['all', ...uniqueValues(jobs.map((job) => job.platform))]}
            selected={values.platform}
            onSelect={onChangePlatform}
          />
          <FilterOptionGroup
            title="城市"
            values={['all', ...uniqueValues(jobs.map((job) => normalizeCityLabel(job.city)))]}
            selected={values.city}
            onSelect={onChangeCity}
          />
          <FilterOptionGroup
            title="简历"
            values={['all', ...uniqueValues(jobs.map((job) => job.resume))]}
            selected={values.resume}
            onSelect={onChangeResume}
          />
          <View style={styles.filterGroup}>
            <Text style={styles.formLabel}>日期依据</Text>
            <View style={styles.filterRowWrap}>
              {([
                ['activity', '最近动态'],
                ['applied', '投递日期'],
                ['interview', '面试日期'],
                ['closed', '结束日期'],
                ['created', '录入日期'],
              ] as Array<[JobDateBasis, string]>).map(([value, label]) => (
                <FilterChip key={value} label={label} active={dateBasis === value} onPress={() => onChangeDateBasis(value)} />
              ))}
            </View>
          </View>
          <View style={styles.filterGroup}>
            <Text style={styles.formLabel}>时间范围</Text>
            <DateRangeSelector value={dateRange} onChange={onChangeDateRange} />
          </View>
    </SheetScaffold>
  );
}

function mergeImportedInterviewDetails(current: InterviewDraft, draft: ScreenshotInterviewDraft): InterviewDraft {
  const importedNote = [
    draft.address ? `面试地址：${draft.address}` : '',
    draft.notes,
  ].filter(Boolean).join('\n');
  return {
    ...current,
    note: [current.note, importedNote].filter(Boolean).join('\n'),
    interviewerName: draft.contactName || current.interviewerName,
    interviewerTitle: draft.contactTitle || current.interviewerTitle,
  };
}

function ScreenshotDraftsModal({
  visible,
  drafts,
  selectedIds,
  progress,
  onToggle,
  onSelectAll,
  onClearSelection,
  onToggleDuplicateAction,
  onDismiss,
  onDiscard,
  onSave,
}: {
  visible: boolean;
  drafts: ScreenshotImportDraft[];
  selectedIds: number[];
  progress: { completed: number; total: number } | null;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleDuplicateAction: (id: number) => void;
  onDismiss: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <SheetScaffold
      visible={visible}
      title="批量导入"
      subtitle={progress ? '识别完成后可逐条核对' : `已选 ${selectedIds.length}/${drafts.length}`}
      onClose={onDismiss}
      dismissible={!progress}
      footer={!progress ? (
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onDismiss}>
            <Text style={styles.secondaryButtonText}>稍后核对</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>导入选中</Text>
          </Pressable>
        </View>
      ) : undefined}
    >
          {progress ? (
            <View style={styles.ocrProgressPanel}>
              <Text style={styles.rowTitle}>正在识别截图</Text>
              <Text style={styles.rowDetail}>{progress.completed}/{progress.total}</Text>
              <View style={styles.preparationProgressTrack}>
                <View style={[styles.preparationProgressFill, { width: `${progress.total ? (progress.completed / progress.total) * 100 : 0}%` }]} />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.draftSelectionToolbar}>
                <Pressable onPress={onDiscard}><Text style={styles.discardTextAction}>放弃结果</Text></Pressable>
                <Pressable onPress={onSelectAll}><Text style={styles.audioTextAction}>全选</Text></Pressable>
                <Pressable onPress={onClearSelection}><Text style={styles.audioTextAction}>清空</Text></Pressable>
              </View>
              <View style={styles.draftList}>
                {drafts.map((draft) => {
                  const selected = selectedIds.includes(draft.id);
                  const title = draft.kind === 'job' ? draft.job.title : `${draft.interview.round} · ${draft.interview.title}`;
                  const company = draft.kind === 'job' ? draft.job.company : draft.interview.company;
                  const detail = draft.kind === 'job'
                    ? [draft.note.recordDate, draft.job.city, draft.job.salary, draft.note.experience, draft.note.education].filter(Boolean).join(' · ')
                    : [formatInterviewSchedule(draft.interview.startsAt, draft.id), draft.interview.type, draft.interview.status].filter(Boolean).join(' · ');
                  return (
                    <Pressable key={draft.id} style={[styles.draftCard, selected && styles.draftCardActive]} onPress={() => onToggle(draft.id)}>
                      <View style={styles.jobRowHeader}>
                        <View style={styles.flexOne}>
                          <Text style={styles.draftKind}>{draft.kind === 'job' ? '职位' : '面试'}</Text>
                          <Text style={styles.rowTitle}>{title}</Text>
                          <Text style={styles.rowDetail}>{company}</Text>
                        </View>
                        <View style={[styles.selectionMark, selected && styles.selectionMarkActive]}>
                          {selected ? <AppIcon name="check" size={17} color="#FFFFFF" /> : null}
                        </View>
                      </View>
                      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
                      {draft.kind === 'interview' ? (
                        <View style={styles.interviewLinkNotice}>
                          <AppIcon name={draft.willCreateJob ? 'add' : 'link'} size={14} color={draft.willCreateJob ? '#7C3AED' : '#047857'} />
                          <Text style={[styles.interviewLinkNoticeText, draft.willCreateJob && styles.interviewLinkNoticeTextNew]}>
                            {draft.willCreateJob ? '未找到对应岗位 · 导入时自动添加' : `已匹配现有岗位 · ${draft.linkedJobTitle || draft.interview.title}`}
                          </Text>
                        </View>
                      ) : null}
                      {draft.kind === 'interview' && (draft.contactName || draft.address || draft.notes) ? (
                        <Text style={styles.draftJdPreview} numberOfLines={3}>
                          {[
                            draft.contactName ? `联系人：${[draft.contactName, draft.contactTitle].filter(Boolean).join(' · ')}` : '',
                            draft.address ? `地址：${draft.address}` : '',
                            draft.notes,
                          ].filter(Boolean).join('\n')}
                        </Text>
                      ) : null}
                      {draft.kind === 'job' && draft.note.jdSummary ? (
                        <Text style={styles.draftJdPreview} numberOfLines={2}>{draft.note.jdSummary}</Text>
                      ) : null}
                      <View style={styles.ocrConfidenceRow}>
                        {Object.entries(draft.confidence ?? {}).sort(([, left], [, right]) => (left === 'low' ? -1 : 0) - (right === 'low' ? -1 : 0)).slice(0, 6).map(([field, confidence]) => (
                          <Text key={field} style={[styles.ocrConfidenceTag, confidence === 'low' && styles.ocrConfidenceTagLow]}>
                            {formatOcrField(field)} · {formatOcrConfidence(confidence)}
                          </Text>
                        ))}
                      </View>
                      {draft.duplicateOf ? (
                        <Pressable
                          haptic="selection"
                          style={styles.duplicateActionButton}
                          onPress={(event) => { event.stopPropagation(); onToggleDuplicateAction(draft.id); }}
                        >
                          <Text style={styles.duplicateActionText}>发现重复 · {draft.duplicateAction === 'create' ? '另建一条' : '合并更新'}</Text>
                        </Pressable>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
    </SheetScaffold>
  );
}

function HomeMetricDetailModal({
  visible,
  metricKey,
  jobs,
  interviews,
  onClose,
}: {
  visible: boolean;
  metricKey: HomeMetricKey | null;
  jobs: Job[];
  interviews: Interview[];
  onClose: () => void;
}) {
  const detail = metricKey ? buildHomeMetricDetail(metricKey, jobs, interviews) : null;

  return (
    <SheetScaffold visible={visible} title={detail?.title ?? '数据详情'} subtitle={detail?.summary ?? ''} onClose={onClose}>
          <View style={styles.draftList}>
            {detail?.rows.length ? (
              detail.rows.map((row) => <ListRow key={`${row.title}-${row.detail}`} title={row.title} detail={row.detail} />)
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>暂无匹配记录。</Text>
              </View>
            )}
          </View>
    </SheetScaffold>
  );
}

function FilterOptionGroup({
  title,
  values,
  selected,
  onSelect,
}: {
  title: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{title}</Text>
      <View style={styles.filterRowWrap}>
        {values.map((value) => (
          <FilterChip
            key={value}
            label={value === 'all' ? '全部' : value}
            active={selected === value}
            onPress={() => onSelect(value)}
          />
        ))}
      </View>
    </View>
  );
}

function InterviewDateTimeField({
  value,
  recordId,
  onChange,
}: {
  value: string;
  recordId?: number;
  onChange: (value: string) => void;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const selected = resolveInterviewDateTime(value, recordId) ?? getDefaultInterviewDateTime();
  const hasValue = Boolean(resolveInterviewDateTime(value, recordId));

  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>面试时间</Text>
      <Pressable style={styles.formPickerButton} onPress={() => setPickerVisible(true)}>
        <AppIcon name="calendar" size={18} color="#6B7280" />
        <View style={styles.flexOne}>
          <Text style={hasValue ? styles.formPickerValue : styles.formPickerPlaceholder} numberOfLines={1}>
            {hasValue ? formatInterviewDateChoice(selected) : '选择日期与时间'}
          </Text>
          {hasValue ? (
            <Text style={styles.rowDetail} numberOfLines={1}>
              {String(selected.getHours()).padStart(2, '0')}:{String(selected.getMinutes()).padStart(2, '0')}
            </Text>
          ) : null}
        </View>
        <AppIcon name="chevron" size={17} color="#9CA3AF" />
      </Pressable>
      <ReminderDateTimePicker
        visible={pickerVisible}
        value={selected}
        title="选择面试时间"
        timeLabel="开始时间"
        confirmLabel="确定时间"
        allowPast
        onClose={() => setPickerVisible(false)}
        onConfirm={(nextValue) => {
          onChange(formatInterviewDateTimeStorage(nextValue));
          setPickerVisible(false);
        }}
      />
    </View>
  );
}

function NewInterviewModal({
  visible,
  jobs,
  selectedJobId,
  values,
  onSelectJob,
  onChangeCompany,
  onChangeTitle,
  onChangeRound,
  onChangeStartsAt,
  onChangeType,
  onCancel,
  onSave,
}: {
  visible: boolean;
  jobs: Job[];
  selectedJobId: number | null;
  values: { company: string; title: string; round: string; startsAt: string; type: string };
  onSelectJob: (job: Job) => void;
  onChangeCompany: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onChangeRound: (value: string) => void;
  onChangeStartsAt: (value: string) => void;
  onChangeType: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <SheetScaffold
      visible={visible}
      title="新增面试"
      onClose={onCancel}
      footer={(
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>保存</Text>
          </Pressable>
        </View>
      )}
    >
          <View style={styles.formField}>
            <Text style={styles.formLabel}>关联职位</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.actionRow}>
                {jobs.map((job) => {
                  const active = selectedJobId === job.id;
                  return (
                    <Pressable
                      key={job.id}
                      style={[styles.resultButton, active && styles.resultButtonActive]}
                      onPress={() => onSelectJob(job)}
                    >
                      <Text style={[styles.resultButtonText, active && styles.resultButtonTextActive]}>
                        {job.company}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
          <FormInput label="公司" value={values.company} onChangeText={onChangeCompany} placeholder="例如：栈途智能" />
          <FormInput label="岗位" value={values.title} onChangeText={onChangeTitle} placeholder="例如：AI 解决方案工程师" />
          <FormInput label="轮次" value={values.round} onChangeText={onChangeRound} placeholder="例如：技术一面" />
          <InterviewDateTimeField value={values.startsAt} onChange={onChangeStartsAt} />
          <FormInput label="形式" value={values.type} onChangeText={onChangeType} placeholder="电话 / 视频 / 现场" />
    </SheetScaffold>
  );
}

function NewJobModal({
  visible,
  values,
  onChangeCompany,
  onChangeTitle,
  onChangePlatform,
  onChangeCity,
  onChangeSalary,
  onChangeTags,
  resumeVersions,
  onChangeResume,
  importedFrom,
  onCancel,
  onSave,
}: {
  visible: boolean;
  values: { company: string; title: string; platform: string; city: string; salary: string; tags: string; resume: string };
  onChangeCompany: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onChangePlatform: (value: string) => void;
  onChangeCity: (value: string) => void;
  onChangeSalary: (value: string) => void;
  onChangeTags: (value: string) => void;
  resumeVersions: ResumeVersion[];
  onChangeResume: (value: string) => void;
  importedFrom: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <SheetScaffold
      visible={visible}
      title="新增职位"
      subtitle={importedFrom ? `${importedFrom} · 请核对字段后保存` : undefined}
      onClose={onCancel}
      footer={(
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>保存</Text>
          </Pressable>
        </View>
      )}
    >
          {importedFrom ? (
            <View style={styles.infoBox}>
              <Text style={styles.rowTitle}>截图导入</Text>
              <Text style={styles.rowDetail}>{importedFrom} · 请核对字段后保存</Text>
            </View>
          ) : null}
          <FormInput label="公司" value={values.company} onChangeText={onChangeCompany} placeholder="例如：云岚科技" />
          <FormInput label="岗位" value={values.title} onChangeText={onChangeTitle} placeholder="例如：AI 应用工程师" />
          <FormChoice label="平台" value={values.platform} options={[values.platform, 'Boss直聘', '官网', '猎聘', '拉勾']} onSelect={onChangePlatform} />
          <FormChoice label="城市" value={values.city} options={[values.city, '长沙', '广州', '深圳', '杭州', '远程']} onSelect={onChangeCity} />
          <FormInput label="薪资" value={values.salary} onChangeText={onChangeSalary} placeholder="例如：18-28K" />
          <FormInput label="关键词" value={values.tags} onChangeText={onChangeTags} placeholder="RAG, Agent, 交付" />
          <View style={styles.formField}>
            <Text style={styles.formLabel}>简历版本</Text>
            <View style={styles.filterRowWrap}>
              {resumeVersions.map((resume) => (
                <FilterChip
                  key={resume.id}
                  label={resume.name}
                  active={values.resume === resume.name}
                  onPress={() => onChangeResume(resume.name)}
                />
              ))}
            </View>
          </View>
    </SheetScaffold>
  );
}

function NewResumeModal({
  visible,
  editing,
  values,
  onChangeName,
  onChangeTargetRole,
  onChangeKeywords,
  onChangeContent,
  onPickFile,
  onCancel,
  onSave,
}: {
  visible: boolean;
  editing: boolean;
  values: { name: string; targetRole: string; keywords: string; fileName: string; content: string };
  onChangeName: (value: string) => void;
  onChangeTargetRole: (value: string) => void;
  onChangeKeywords: (value: string) => void;
  onChangeContent: (value: string) => void;
  onPickFile: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <SheetScaffold
      visible={visible}
      title={editing ? '编辑简历版本' : '新增简历版本'}
      onClose={onCancel}
      footer={(
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onCancel}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>保存</Text>
          </Pressable>
        </View>
      )}
    >
          <FormInput label="版本名称" value={values.name} onChangeText={onChangeName} placeholder="例如：FDE_AI_v4" />
          <FormInput
            label="目标岗位"
            value={values.targetRole}
            onChangeText={onChangeTargetRole}
            placeholder="例如：AI 解决方案工程师"
          />
          <FormInput
            label="关键词"
            value={values.keywords}
            onChangeText={onChangeKeywords}
            placeholder="RAG, Agent, 交付"
          />
          <View style={styles.formField}>
            <Text style={styles.formLabel}>简历文件</Text>
            <Pressable style={styles.secondaryButton} onPress={onPickFile}>
              <Text style={styles.secondaryButtonText}>{values.fileName || '选择 PDF / DOCX'}</Text>
            </Pressable>
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>简历正文</Text>
            <TextInput
              multiline
              style={styles.resumeContentArea}
              textAlignVertical="top"
              value={values.content}
              onChangeText={onChangeContent}
              placeholder="粘贴简历正文。HR 沟通助手只会使用这里和岗位 JD 中已有的事实。"
              maxLength={30000}
            />
            <Text style={styles.inputCounter}>{values.content.length}/30000</Text>
          </View>
    </SheetScaffold>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput style={styles.formInput} value={value} onChangeText={onChangeText} placeholder={placeholder} />
    </View>
  );
}

function CollapsibleFormSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.collapsibleFormSection}>
      <Pressable style={styles.collapsibleFormHeader} onPress={() => { animateNextLayout(); onToggle(); }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.formSectionTitle}>{title}</Text>
        <Text style={styles.collapsibleFormAction}>{open ? '收起' : '展开'}</Text>
      </Pressable>
      {open ? <FadeInView style={styles.collapsibleFormBody}>{children}</FadeInView> : null}
    </View>
  );
}

function FormChoice({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
}) {
  const uniqueOptions = Array.from(new Set(options.map((item) => item.trim()).filter(Boolean)));
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.filterRowWrap}>
        {uniqueOptions.map((option) => <FilterChip key={option} label={option} active={value === option} onPress={() => onSelect(option)} />)}
      </View>
    </View>
  );
}

function PreparationTextArea({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        multiline
        style={styles.noteArea}
        textAlignVertical="top"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
      />
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable haptic="selection" style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DateRangeSelector({ value, onChange }: { value: DateRangeValue; onChange: (value: DateRangeValue) => void }) {
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const presets: Array<{ value: DateRangeValue['preset']; label: string }> = [
    { value: '30d', label: '近30天' },
    { value: '90d', label: '近90天' },
    { value: 'year', label: '今年' },
    { value: 'all', label: '全部' },
    { value: 'custom', label: '自定义' },
  ];
  function selectPreset(preset: DateRangeValue['preset']) {
    if (preset !== 'custom') {
      onChange({ preset, startDate: '', endDate: '' });
      return;
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    onChange({
      preset,
      startDate: value.startDate || formatRecordDate(start),
      endDate: value.endDate || formatRecordDate(end),
    });
  }
  const pickerValue = parseRecordDate(picker === 'start' ? value.startDate : value.endDate);

  return (
    <View style={styles.dateRangeBlock}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.filterRow}>
          {presets.map((preset) => (
            <FilterChip key={preset.value} label={preset.label} active={value.preset === preset.value} onPress={() => selectPreset(preset.value)} />
          ))}
        </View>
      </ScrollView>
      {value.preset === 'custom' ? (
        <View style={styles.dateRangeFields}>
          <Pressable style={styles.dateRangeField} onPress={() => setPicker('start')}>
            <Text style={styles.metricLabel}>开始</Text>
            <Text style={styles.rowTitle}>{value.startDate}</Text>
          </Pressable>
          <Text style={styles.rowDetail}>至</Text>
          <Pressable style={styles.dateRangeField} onPress={() => setPicker('end')}>
            <Text style={styles.metricLabel}>结束</Text>
            <Text style={styles.rowTitle}>{value.endDate}</Text>
          </Pressable>
        </View>
      ) : null}
      {picker ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          onValueChange={(_event, selected) => {
            const date = formatRecordDate(selected);
            onChange({
              ...value,
              startDate: picker === 'start' ? date : value.startDate,
              endDate: picker === 'end' ? date : value.endDate,
            });
            setPicker(null);
          }}
          onDismiss={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}

function DateRangeDropdown({ value, onChange }: { value: DateRangeValue; onChange: (value: DateRangeValue) => void }) {
  const [expanded, setExpanded] = useState(false);
  const label = value.preset === 'all'
    ? '时间'
    : value.preset === '30d'
      ? '近 30 天'
      : value.preset === '90d'
        ? '近 90 天'
        : value.preset === 'year'
          ? '今年'
          : '自定义';
  return (
    <>
      <View style={styles.dateRangeDropdown}>
        <Pressable
          style={[styles.dateRangeDropdownButton, value.preset !== 'all' && styles.dateRangeDropdownButtonActive]}
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`筛选面试时间，当前${label}`}
        >
          <AppIcon name="calendar" size={16} color={value.preset === 'all' ? '#6B7280' : '#1D4ED8'} />
          {value.preset !== 'all' ? (
            <Text style={[styles.dateRangeDropdownText, styles.dateRangeDropdownTextActive]} numberOfLines={1}>{label}</Text>
          ) : null}
        </Pressable>
      </View>
      <SheetScaffold
        visible={expanded}
        title="筛选面试时间"
        subtitle={value.preset === 'all' ? '按面试日期筛选记录' : `当前：${dateRangeLabel(value)}`}
        onClose={() => setExpanded(false)}
      >
          <DateRangeSelector
            value={value}
            onChange={(nextValue) => {
              onChange(nextValue);
              if (nextValue.preset !== 'custom') setExpanded(false);
            }}
          />
      </SheetScaffold>
    </>
  );
}

function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentedTabs}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            haptic="selection"
            style={[styles.segmentedTab, active && styles.segmentedTabActive]}
            onPress={() => { animateNextLayout(); onChange(option.value); }}
          >
            <Text
              style={[styles.segmentedTabText, active && styles.segmentedTabTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TranscriptWaveButton({
  timeLabel,
  isActive,
  isPlaying,
  isLoading,
  disabled,
  onPress,
}: {
  timeLabel: string;
  isActive: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  disabled: boolean;
  onPress: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      style={[
        styles.transcriptWaveButton,
        isActive && styles.transcriptWaveButtonActive,
        disabled && styles.transcriptWaveButtonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || isLoading}
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}，${isPlaying ? '暂停原音' : '播放对应原音'}`}
    >
      <Text
        style={[styles.transcriptWaveTime, isActive && styles.transcriptWaveTimeActive]}
        maxFontSizeMultiplier={1.1}
        numberOfLines={1}
      >
        {timeLabel}
      </Text>
      <View style={styles.transcriptMiniWave}>
        {[5, 10, 7, 13, 8, 11].map((height, waveIndex) => (
          <View
            key={waveIndex}
            style={[
              styles.transcriptMiniWaveBar,
              { height: isLoading ? 7 : height },
              isActive && styles.transcriptMiniWaveBarActive,
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

function PersistentReviewPlayer({
  title,
  currentTime,
  duration,
  isPlaying,
  isLoaded,
  isBuffering,
  hasError,
  targetSeconds,
  onToggle,
  onSeek,
}: {
  title: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  hasError: boolean;
  targetSeconds: number | null;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
}) {
  const statusText = hasError
    ? '定位失败，点击播放重试'
    : isBuffering || !isLoaded
      ? '正在载入录音'
      : targetSeconds !== null
        ? `原音核对 · ${formatDuration(Math.floor(currentTime))}`
        : title;

  return (
    <View style={[styles.persistentReviewPlayer, hasError && styles.persistentReviewPlayerError]}>
      <Pressable
        style={[styles.persistentReviewPlayButton, (!isLoaded && !hasError) && styles.persistentReviewPlayButtonDisabled]}
        onPress={onToggle}
        disabled={isBuffering || (!isLoaded && !hasError)}
        accessibilityLabel={isPlaying ? '暂停录音' : '播放录音'}
      >
        <AppIcon name={isPlaying ? 'pause' : 'play'} size={18} color="#FFFFFF" />
      </Pressable>
      <View style={styles.persistentReviewPlayerBody}>
        <View style={styles.persistentReviewPlayerHeader}>
          <Text style={styles.persistentReviewPlayerTitle} numberOfLines={1} ellipsizeMode="tail">
            {statusText}
          </Text>
          <Text style={styles.persistentReviewPlayerTime} maxFontSizeMultiplier={1.1}>
            {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
          </Text>
        </View>
        <AudioScrubber currentTime={currentTime} duration={duration} onSeek={onSeek} />
      </View>
    </View>
  );
}

function AudioScrubber({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const seekFromEvent = (event: GestureResponderEvent) => {
    if (trackWidth <= 0 || duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
    onSeek(duration * ratio);
  };

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="录音播放进度"
      style={styles.audioScrubberHitbox}
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={seekFromEvent}
      onResponderMove={seekFromEvent}
      onResponderRelease={seekFromEvent}
    >
      <View style={styles.audioScrubberTrack}>
        <View style={[styles.audioScrubberFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.audioScrubberThumb, { left: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function CollapsibleGroup({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode | (() => ReactNode);
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.group}>
      <Pressable
        style={styles.collapsibleHeader}
        accessibilityLabel={`${open ? '收起' : '展开'}${title}`}
        onPress={() => { animateNextLayout(); setOpen((current) => !current); }}
      >
        <Text style={styles.groupTitle}>{title}</Text>
        <AppIcon name={open ? 'chevronDown' : 'chevron'} size={18} color="#8A918D" />
      </Pressable>
      {open ? (
        <FadeInView style={styles.groupBody}>
          {typeof children === 'function' ? children() : children}
        </FadeInView>
      ) : null}
    </View>
  );
}

function MeScreen({
  section,
  jobs,
  interviews,
  jobNotes,
  jobEvents,
  interviewChecklistDone,
  interviewDrafts,
  interviewResults,
  resumeVersions,
  hrAnswerRecords,
  jobResearchItems,
  archivedJobs,
  archivedInterviews,
  userPreferences,
  userInterviewProfile,
  aiServiceSettings,
  aiApiKey,
  ocrApiKey,
  researchApiKey,
  tencentAsrCredentials,
  senseVoiceModelState,
  onSectionChange,
  onOpenHrDemo,
  onLoadPresentationData,
  onOpenJobTask,
  onOpenInterviewTask,
  onUpdatePreferences,
  onUpdateInterviewProfile,
  onUpdateAiSettings,
  onChangeAiApiKey,
  onChangeOcrApiKey,
  onChangeResearchApiKey,
  onUpdateTencentAsrCredentials,
  onSaveAiApiKey,
  onClearAiApiKey,
  onSaveOcrApiKey,
  onClearOcrApiKey,
  onSaveResearchApiKey,
  onClearResearchApiKey,
  onSaveTencentAsrCredentials,
  onClearTencentAsrCredentials,
  onPrepareSenseVoice,
  onCreateFullBackup,
  onRestoreFullBackup,
  onCreateResume,
  onEditResume,
  onArchiveJobs,
  onRestoreJob,
  onRestoreInterview,
}: {
  section: MeSection;
  jobs: Job[];
  interviews: Interview[];
  jobNotes: Record<number, JobNote>;
  jobEvents: Record<number, ApplicationEvent[]>;
  interviewChecklistDone: Record<number, Record<string, boolean>>;
  interviewDrafts: Record<number, InterviewDraft>;
  interviewResults: Record<number, InterviewResult>;
  resumeVersions: ResumeVersion[];
  hrAnswerRecords: Record<number, HrAnswerRecord[]>;
  jobResearchItems: Record<number, JobResearchItem[]>;
  archivedJobs: Record<number, string>;
  archivedInterviews: Record<number, string>;
  userPreferences: UserPreferences;
  userInterviewProfile: UserInterviewProfile;
  aiServiceSettings: AiServiceSettings;
  aiApiKey: string;
  ocrApiKey: string;
  researchApiKey: string;
  tencentAsrCredentials: TencentAsrCredentials;
  senseVoiceModelState: {
    status: 'idle' | 'preparing' | 'ready' | 'failed';
    percent: number;
    detail: string;
  };
  onSectionChange: (section: MeSection) => void;
  onOpenHrDemo: () => void;
  onLoadPresentationData: () => void;
  onOpenJobTask: (jobId: number, section: JobDetailSection) => void;
  onOpenInterviewTask: (interviewId: number, section: InterviewDetailSection) => void;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void;
  onUpdateInterviewProfile: (patch: Partial<UserInterviewProfile>) => void;
  onUpdateAiSettings: (patch: Partial<AiServiceSettings>) => void;
  onChangeAiApiKey: (value: string) => void;
  onChangeOcrApiKey: (value: string) => void;
  onChangeResearchApiKey: (value: string) => void;
  onUpdateTencentAsrCredentials: (patch: Partial<TencentAsrCredentials>) => void;
  onSaveAiApiKey: () => void;
  onClearAiApiKey: () => void;
  onSaveOcrApiKey: () => void;
  onClearOcrApiKey: () => void;
  onSaveResearchApiKey: () => void;
  onClearResearchApiKey: () => void;
  onSaveTencentAsrCredentials: () => void;
  onClearTencentAsrCredentials: () => void;
  onPrepareSenseVoice: () => void;
  onCreateFullBackup: () => Promise<void>;
  onRestoreFullBackup: () => Promise<void>;
  onCreateResume: () => void;
  onEditResume: (resume: ResumeVersion) => void;
  onArchiveJobs: (jobIds: number[]) => void;
  onRestoreJob: (jobId: number) => void;
  onRestoreInterview: (interviewId: number) => void;
}) {
  const [serviceTestBusy, setServiceTestBusy] = useState<'ocr' | 'review' | 'mcp' | null>(null);
  const [backupBusy, setBackupBusy] = useState<'create' | 'restore' | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheInspection, setCacheInspection] = useState<CacheInspection | null>(null);
  const [offerCompareMode, setOfferCompareMode] = useState(false);
  const [offerCompareIds, setOfferCompareIds] = useState<number[]>([]);

  useEffect(() => {
    if (section !== 'data') return;
    let active = true;
    setCacheBusy(true);
    inspectDisposableCache()
      .then((inspection) => {
        if (active) setCacheInspection(inspection);
      })
      .catch(() => {
        if (active) setCacheInspection(null);
      })
      .finally(() => {
        if (active) setCacheBusy(false);
      });
    return () => { active = false; };
  }, [section]);
  const activeJobsForMe = jobs.filter((job) => !archivedJobs[job.id]);
  const activeJobIdsForMe = new Set(activeJobsForMe.map((job) => job.id));
  const activeInterviewsForMe = interviews.filter((interview) => activeJobIdsForMe.has(interview.jobId));
  const archivedJobList = jobs.filter((job) => Boolean(archivedJobs[job.id]));
  const archivedInterviewList = interviews.filter((interview) => Boolean(archivedInterviews[interview.id]));
  const savedAudioCount = Object.values(interviewDrafts).filter((draft) => draft.savedAudioUri).length;
  const reviewedCount = Object.values(interviewDrafts).filter((draft) => draft.audioWorkState === 'reviewed').length;
  const jobNoteCount = Object.values(jobNotes).filter(
    (note) => hasText(note.jdSummary) || hasText(note.nextAction) || hasText(note.note),
  ).length;
  const doneChecklistCount = Object.values(interviewChecklistDone).reduce(
    (sum, items) => sum + Object.values(items).filter(Boolean).length,
    0,
  );
  const followupTodos = buildHomeTodos(activeJobsForMe, jobNotes, activeInterviewsForMe, interviewDrafts, interviewResults);
  const offeredJobs = activeJobsForMe.filter((job) => job.status === 'offered');
  const comparedOffers = offeredJobs.filter((job) => offerCompareIds.includes(job.id));
  const offerComparison = buildOfferComparison(comparedOffers, jobNotes);
  const archiveCandidates = activeJobsForMe.filter((job) => isArchiveCandidate({
    job,
    note: jobNotes[job.id],
    events: jobEvents[job.id],
    interviews: activeInterviewsForMe.filter((interview) => interview.jobId === job.id),
    interviewDrafts,
    hrAnswers: hrAnswerRecords[job.id],
  }));
  const archivedGroups = Object.entries(archivedJobList.reduce<Record<string, Job[]>>((groups, job) => {
    const lifecycle = getJobLifecycleDates({
      job,
      note: jobNotes[job.id],
      events: jobEvents[job.id],
      interviews: interviews.filter((interview) => interview.jobId === job.id),
      interviewDrafts,
      hrAnswers: hrAnswerRecords[job.id],
    });
    const archivedAt = new Date(archivedJobs[job.id]);
    const year = (lifecycle.closed ?? lifecycle.activity ?? (Number.isFinite(archivedAt.getTime()) ? archivedAt : new Date())).getFullYear().toString();
    groups[year] = [...(groups[year] ?? []), job];
    return groups;
  }, {})).sort(([left], [right]) => Number(right) - Number(left));
  const dataHealthRows = [
    { title: '职位信息', detail: `${activeJobsForMe.length} 个当前职位 · ${archivedJobList.length} 个已归档` },
    { title: '面试资料', detail: `${activeInterviewsForMe.length} 场当前面试 · ${reviewedCount} 场已复盘` },
    { title: '音频记录', detail: `${savedAudioCount} 段本地录音 · ${doneChecklistCount} 个准备项完成` },
    { title: 'Offer 决策', detail: `${offeredJobs.length} 个 Offer · ${offeredJobs.filter((job) => hasText(jobNotes[job.id]?.offerDecision)).length} 个有结论` },
  ];
  const weeklyReport = buildWeeklyReport(activeJobsForMe, activeInterviewsForMe, jobEvents, interviewDrafts, interviewResults);
  async function testConfiguredService(kind: 'ocr' | 'review') {
    setServiceTestBusy(kind);
    try {
      await testChatServiceConnection({
        serviceUrl: kind === 'ocr' ? aiServiceSettings.ocrUrl : aiServiceSettings.reviewUrl,
        model: kind === 'ocr' ? aiServiceSettings.ocrModel : aiServiceSettings.reviewModel,
        apiKey: kind === 'ocr' ? ocrApiKey : aiApiKey,
        vision: kind === 'ocr',
      });
      Alert.alert('连接成功', kind === 'ocr' ? '视觉模型已成功读取内置测试图片。' : '复盘模型已成功返回测试内容。');
    } catch (error) {
      Alert.alert('连接失败', error instanceof Error ? error.message : '请求没有成功完成。');
    } finally {
      setServiceTestBusy(null);
    }
  }
  async function testResearchMcp() {
    setServiceTestBusy('mcp');
    try {
      const status = await testXiaohongshuMcpConnection(aiServiceSettings.researchMcpUrl ?? '');
      Alert.alert(status.loggedIn ? '连接成功' : '需要登录', status.detail);
    } catch (error) {
      Alert.alert('连接失败', error instanceof Error ? error.message : 'MCP 请求没有成功完成。');
    } finally {
      setServiceTestBusy(null);
    }
  }
  function shareExcelData() {
    exportJobHuntWorkbook({
      jobs,
      interviews,
      jobNotes,
      jobEvents,
      interviewDrafts,
      interviewResults,
      interviewChecklistDone,
    }).catch((error: unknown) => {
      const message = error instanceof Error && error.message === 'sharing-unavailable'
        ? '当前设备不支持系统文件分享。'
        : 'Excel 文件没有成功生成，请稍后重试。';
      Alert.alert('导出失败', message);
    });
  }

  const backButton = section !== 'main' ? (
    <Pressable style={styles.backButton} onPress={() => onSectionChange('main')}>
      <AppIcon name="back" size={18} color="#2B3935" />
      <Text style={styles.backButtonText}>返回我的</Text>
    </Pressable>
  ) : null;

  if (section === 'resumes') {
    return (
      <>
        {backButton}
        <Group title="简历版本">
          <View style={styles.sectionBody}>
            <Pressable style={styles.primaryButton} onPress={onCreateResume}>
              <Text style={styles.primaryButtonText}>新增简历版本</Text>
            </Pressable>
          </View>
          {resumeVersions.map((resume) => (
            <ListRow
              key={resume.id}
              title={resume.name}
              detail={resume.targetRole + ' · ' + (resume.keywords.join(' / ') || '未填写关键词') + ` · ${resume.content.trim() ? '正文已就绪' : '待补正文'}`}
              onPress={() => onEditResume(resume)}
            />
          ))}
        </Group>
      </>
    );
  }

  if (section === 'followups') {
    return (
      <>
        {backButton}
        <Group title="跟进中心">
          {followupTodos.length ? (
            followupTodos.map((todo) => (
              <Pressable
                key={todo.id}
                style={styles.todoCard}
                onPress={() => {
                  if (todo.target.type === 'job') {
                    onOpenJobTask(todo.target.id, todo.target.section);
                    return;
                  }
                  onOpenInterviewTask(todo.target.id, todo.target.section);
                }}
              >
                <View style={styles.flexOne}>
                  <View style={styles.todoTitleRow}>
                    <Text style={styles.rowTitle}>{todo.title}</Text>
                    <Text style={styles.todoPriority}>{todo.priority}</Text>
                  </View>
                  <Text style={styles.rowDetail}>{todo.detail}</Text>
                </View>
                <AppIcon name="chevron" size={18} color="#9CA3AF" />
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>当前没有紧急待办。</Text>
            </View>
          )}
        </Group>
      </>
    );
  }

  if (section === 'offers') {
    return (
      <>
        {backButton}
        <Group title="Offer 中心">
          {offeredJobs.length >= 2 ? (
            <View style={styles.offerCompareToolbar}>
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle}>{offerCompareMode ? `已选 ${offerCompareIds.length} 个 Offer` : '横向对比'}</Text>
                <Text style={styles.rowDetail}>选择 2–4 个，对比薪资、福利、风险和机会成本</Text>
              </View>
              <Pressable style={styles.inlineEditButton} onPress={() => {
                setOfferCompareMode((value) => !value);
                if (offerCompareMode) setOfferCompareIds([]);
              }}><Text style={styles.inlineEditButtonText}>{offerCompareMode ? '完成' : '开始对比'}</Text></Pressable>
            </View>
          ) : null}
          {offeredJobs.length ? (
            offeredJobs.map((job) => {
              const note = { ...emptyJobNote, ...(jobNotes[job.id] ?? {}) };
              const summary = buildOfferDecisionSummary(job, note);
              const selected = offerCompareIds.includes(job.id);
              return (
                <Pressable
                  key={job.id}
                  style={[styles.offerCompareRow, selected && styles.selectableRowActive]}
                  onPress={() => {
                    if (!offerCompareMode) {
                      onOpenJobTask(job.id, 'offer');
                      return;
                    }
                    setOfferCompareIds((current) => current.includes(job.id)
                      ? current.filter((id) => id !== job.id)
                      : current.length < 4 ? [...current, job.id] : current);
                  }}
                >
                  {offerCompareMode ? <View style={[styles.selectionBox, selected && styles.selectionBoxActive]}>{selected ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}</View> : null}
                  <View style={styles.flexOne}>
                    <Text style={styles.rowTitle}>{job.company} · {note.offerTotalPackage || job.salary}</Text>
                    <Text style={styles.rowDetail} numberOfLines={2}>{summary.title} · {note.offerDecision || note.offerNegotiation || '待记录决策'}</Text>
                  </View>
                  {!offerCompareMode ? <AppIcon name="chevron" size={18} color="#9CA3AF" /> : null}
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>还没有进入 Offer 的职位。</Text>
            </View>
          )}
        </Group>
        {offerCompareMode && comparedOffers.length >= 2 ? (
          <FadeInView style={styles.offerComparisonPanel}>
            <Text style={styles.detailSubject}>对比结果</Text>
            <Text style={styles.rowDetail}>金额为可解析文本的估算，非金钱因素保留原记录，不生成假精确总分。</Text>
            {offerComparison.map((item) => (
              <View style={styles.offerComparisonCard} key={item.jobId}>
                <View style={styles.sectionHeadingRow}>
                  <Text style={styles.rowTitle}>{item.company}</Text>
                  {item.isHighestCash ? <Text style={styles.offerBestTag}>现金上限</Text> : null}
                </View>
                <Text style={styles.offerComparisonValue}>{item.compensation}</Text>
                {item.opportunityCost ? <Text style={styles.offerCostText}>{item.opportunityCost}</Text> : null}
                <Text style={styles.rowDetail} numberOfLines={3}>福利：{item.benefits}</Text>
                <Text style={styles.rowDetail} numberOfLines={3}>风险：{item.risks}</Text>
                <Text style={styles.rowDetail} numberOfLines={2}>入职：{item.startDate}</Text>
              </View>
            ))}
          </FadeInView>
        ) : offerCompareMode ? <Text style={styles.activeFilterText}>再选 {Math.max(0, 2 - comparedOffers.length)} 个 Offer 开始对比</Text> : null}
      </>
    );
  }

  if (section === 'archive') {
    return (
      <>
        {backButton}
        {archiveCandidates.length ? (
          <Group title={`建议归档 · ${archiveCandidates.length}`}>
            <View style={styles.sectionBody}>
              <Text style={styles.rowDetail}>以下职位已结束且超过 180 天没有动态。归档只隐藏当前列表，不删除面试、录音和复盘。</Text>
              <Pressable style={styles.secondaryButton} onPress={() => onArchiveJobs(archiveCandidates.map((job) => job.id))}>
                <Text style={styles.secondaryButtonText}>归档全部建议项</Text>
              </Pressable>
            </View>
            {archiveCandidates.map((job) => (
              <ListRow
                key={job.id}
                title={`${job.company} · ${job.title}`}
                detail={`最近动态 ${formatActivityDate(getJobLifecycleDates({ job, note: jobNotes[job.id], events: jobEvents[job.id] }).activity)}`}
                onPress={() => onOpenJobTask(job.id, 'overview')}
              />
            ))}
          </Group>
        ) : null}
        {archivedGroups.map(([year, yearJobs]) => (
          <Group key={year} title={`${year} 年求职记录`}>
            {yearJobs.map((job) => {
              const linked = interviews.filter((interview) => interview.jobId === job.id);
              return (
                <View style={styles.archiveRow} key={job.id}>
                  <Pressable style={styles.flexOne} onPress={() => onOpenJobTask(job.id, 'overview')}>
                    <Text style={styles.rowTitle}>{job.company} · {job.title}</Text>
                    <Text style={styles.rowDetail}>{statusMeta[job.status].label} · {linked.length} 场面试 · {jobResearchItems[job.id]?.length ?? 0} 条调研资料</Text>
                  </Pressable>
                  <Pressable style={styles.smallSecondaryButton} onPress={() => onRestoreJob(job.id)}>
                    <Text style={styles.smallSecondaryButtonText}>恢复</Text>
                  </Pressable>
                </View>
              );
            })}
          </Group>
        ))}
        {archivedInterviewList.length ? (
          <Group title={`已归档面试 · ${archivedInterviewList.length}`}>
            {archivedInterviewList.map((interview) => (
              <View style={styles.archiveRow} key={interview.id}>
                <View style={styles.flexOne}>
                  <Text style={styles.rowTitle}>{interview.company} · {interview.round}</Text>
                  <Text style={styles.rowDetail} numberOfLines={1}>{interview.title} · {formatInterviewSchedule(interview.startsAt, interview.id)}</Text>
                </View>
                <Pressable style={styles.smallSecondaryButton} onPress={() => onRestoreInterview(interview.id)}>
                  <Text style={styles.smallSecondaryButtonText}>恢复</Text>
                </Pressable>
              </View>
            ))}
          </Group>
        ) : null}
        {!archiveCandidates.length && !archivedGroups.length && !archivedInterviewList.length ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>目前没有需要归档的历史职位。</Text>
          </View>
        ) : null}
      </>
    );
  }

  if (section === 'ai') {
    const tencentReady = Boolean(
      tencentAsrCredentials.appId.trim() &&
      tencentAsrCredentials.secretId.trim() &&
      tencentAsrCredentials.secretKey.trim(),
    );
    const reviewReady = Boolean(
      aiServiceSettings.reviewUrl.trim() && aiServiceSettings.reviewModel.trim() && aiApiKey.trim(),
    );
    const ocrReady = Boolean(aiServiceSettings.ocrUrl.trim() && aiServiceSettings.ocrModel.trim() && ocrApiKey.trim());
    const researchReady = Boolean(aiServiceSettings.researchMcpUrl?.trim() || researchApiKey.trim());
    return (
      <>
        {backButton}
        <Group title="连接状态">
          <ListRow
            title="语音转写"
            detail={aiServiceSettings.transcriptionProvider === 'tencent-flash'
              ? tencentReady ? '腾讯云极速版已配置' : '腾讯云凭据待填写'
              : aiServiceSettings.transcriptionProvider === 'local-sensevoice'
                ? senseVoiceModelState.detail
                : '本地 Whisper'}
          />
          <ListRow title="AI 面试复盘" detail={reviewReady ? '配置完整，可以基于本地转写生成复盘' : '待填写复盘 URL、模型和 API Key'} />
          <ListRow title="截图批量识别" detail={ocrReady ? '配置完整，可以识别多张职位和面试截图' : '待填写 OCR URL、视觉模型和 API Key'} />
          <ListRow title="在线调研" detail={aiServiceSettings.researchMcpUrl?.trim() ? '小红书 MCP 已配置' : researchReady ? 'Jina Search 已配置' : '待配置调研服务'} />
        </Group>
        <Group title="在线调研搜索">
          <View style={styles.jobDetailPanel}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>小红书 MCP 地址</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.formInput}
                value={aiServiceSettings.researchMcpUrl ?? ''}
                onChangeText={(value) => onUpdateAiSettings({ researchMcpUrl: value })}
                placeholder="http://电脑局域网地址:18060/mcp"
              />
            </View>
            <Pressable style={[styles.secondaryButton, serviceTestBusy === 'mcp' && styles.buttonDisabled]} disabled={serviceTestBusy !== null} onPress={testResearchMcp}>
              <Text style={styles.secondaryButtonText}>{serviceTestBusy === 'mcp' ? '正在检查 MCP...' : '测试 MCP 与登录状态'}</Text>
            </Pressable>
            <Text style={styles.rowDetail}>手机不能使用 localhost，请填写运行 MCP 的电脑局域网或 Tailscale 等私有组网地址。批量调研会串行核验少量帖子与评论，未明确提到公司名称的结果不会自动采纳。</Text>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Jina Search API Key</Text>
              <TextInput
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.formInput}
                value={researchApiKey}
                onChangeText={onChangeResearchApiKey}
                placeholder="jina_..."
              />
            </View>
            <Text style={styles.rowDetail}>Jina 用于普通公开网页搜索；小红书内容优先使用 MCP。搜索密钥与复盘模型密钥相互独立。</Text>
            <Pressable style={styles.primaryButton} onPress={onSaveResearchApiKey}>
              <Text style={styles.primaryButtonText}>保存在线调研密钥</Text>
            </Pressable>
            <Pressable style={styles.destructiveButton} onPress={onClearResearchApiKey}>
              <Text style={styles.destructiveButtonText}>清除在线调研密钥</Text>
            </Pressable>
          </View>
        </Group>
        <Group title="语音转写">
          <View style={styles.jobDetailPanel}>
            <View style={styles.filterRowWrap}>
              <FilterChip
                label="腾讯云"
                active={aiServiceSettings.transcriptionProvider === 'tencent-flash'}
                onPress={() => onUpdateAiSettings({ transcriptionProvider: 'tencent-flash' })}
              />
              <FilterChip
                label="SenseVoice"
                active={aiServiceSettings.transcriptionProvider === 'local-sensevoice'}
                onPress={() => onUpdateAiSettings({ transcriptionProvider: 'local-sensevoice' })}
              />
              <FilterChip
                label="本地 Whisper"
                active={aiServiceSettings.transcriptionProvider === 'local-whisper'}
                onPress={() => onUpdateAiSettings({ transcriptionProvider: 'local-whisper' })}
              />
            </View>
            {aiServiceSettings.transcriptionProvider === 'local-sensevoice' ? (
              <>
                <ListRow
                  title="SenseVoice Int8"
                  detail={`${senseVoiceModelState.detail} · 约 166MB`}
                />
                <Pressable
                  style={[styles.primaryButton, senseVoiceModelState.status === 'preparing' && styles.buttonDisabled]}
                  disabled={senseVoiceModelState.status === 'preparing'}
                  onPress={onPrepareSenseVoice}
                >
                  <Text style={styles.primaryButtonText}>
                    {senseVoiceModelState.status === 'preparing'
                      ? `准备中 ${senseVoiceModelState.percent}%`
                      : senseVoiceModelState.status === 'ready' ? '重新检查模型' : '下载本地模型'}
                  </Text>
                </Pressable>
              </>
            ) : null}
            {aiServiceSettings.transcriptionProvider === 'tencent-flash' ? (
              <>
                <FormInput
                  label="识别引擎"
                  value={aiServiceSettings.tencentEngineType}
                  onChangeText={(value) => onUpdateAiSettings({ tencentEngineType: value })}
                  placeholder="16k_zh_en"
                />
                <FormInput
                  label="AppID"
                  value={tencentAsrCredentials.appId}
                  onChangeText={(value) => onUpdateTencentAsrCredentials({ appId: value })}
                  placeholder="腾讯云 AppID"
                />
                <FormInput
                  label="SecretID"
                  value={tencentAsrCredentials.secretId}
                  onChangeText={(value) => onUpdateTencentAsrCredentials({ secretId: value })}
                  placeholder="SecretID"
                />
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>SecretKey</Text>
                  <TextInput
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.formInput}
                    value={tencentAsrCredentials.secretKey}
                    onChangeText={(value) => onUpdateTencentAsrCredentials({ secretKey: value })}
                    placeholder="SecretKey"
                  />
                </View>
                <Pressable style={styles.primaryButton} onPress={onSaveTencentAsrCredentials}>
                  <Text style={styles.primaryButtonText}>保存腾讯云凭据</Text>
                </Pressable>
                <Pressable style={styles.destructiveButton} onPress={onClearTencentAsrCredentials}>
                  <Text style={styles.destructiveButtonText}>清除腾讯云凭据</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Group>
        <Group title="截图识别接口">
          <View style={styles.jobDetailPanel}>
            <FormInput
              label="服务地址"
              value={getServiceBaseUrl(aiServiceSettings.ocrUrl)}
              onChangeText={(value) => onUpdateAiSettings({ ocrUrl: value })}
              placeholder="https://api.example.com/v1"
            />
            <FormInput
              label="视觉模型"
              value={aiServiceSettings.ocrModel}
              onChangeText={(value) => onUpdateAiSettings({ ocrModel: value })}
              placeholder="填写支持图片输入的模型 ID"
            />
            <View style={styles.formField}>
              <Text style={styles.formLabel}>截图识别 API Key</Text>
              <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.formInput} value={ocrApiKey} onChangeText={onChangeOcrApiKey} placeholder="sk-..." />
            </View>
            <Text style={styles.rowDetail}>只需填写到 /v1，后续请求路径由应用自动补全。</Text>
            <Pressable style={[styles.secondaryButton, serviceTestBusy === 'ocr' && styles.buttonDisabled]} disabled={serviceTestBusy !== null} onPress={() => testConfiguredService('ocr')}>
              <Text style={styles.secondaryButtonText}>{serviceTestBusy === 'ocr' ? '正在测试图片识别...' : '测试截图识别连接'}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onSaveOcrApiKey}><Text style={styles.primaryButtonText}>保存截图识别密钥</Text></Pressable>
            <Pressable style={styles.destructiveButton} onPress={onClearOcrApiKey}><Text style={styles.destructiveButtonText}>清除截图识别密钥</Text></Pressable>
          </View>
        </Group>
        <Group title="AI 复盘接口">
          <View style={styles.jobDetailPanel}>
            <FormInput
              label="服务地址"
              value={getServiceBaseUrl(aiServiceSettings.reviewUrl)}
              onChangeText={(value) => onUpdateAiSettings({ reviewUrl: value })}
              placeholder="https://api.example.com/v1"
            />
            <FormInput
              label="复盘模型"
              value={aiServiceSettings.reviewModel}
              onChangeText={(value) => onUpdateAiSettings({ reviewModel: value })}
              placeholder="填写服务支持的模型 ID"
            />
            <View style={styles.formField}>
              <Text style={styles.formLabel}>复盘与沟通 API Key</Text>
              <TextInput
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.formInput}
                value={aiApiKey}
                onChangeText={onChangeAiApiKey}
                placeholder="sk-..."
              />
            </View>
            <Text style={styles.rowDetail}>用于面试复盘、模拟面试和 HR 沟通助手；只需填写地址到 /v1。</Text>
            <Pressable style={[styles.secondaryButton, serviceTestBusy === 'review' && styles.buttonDisabled]} disabled={serviceTestBusy !== null} onPress={() => testConfiguredService('review')}>
              <Text style={styles.secondaryButtonText}>{serviceTestBusy === 'review' ? '正在测试文本模型...' : '测试复盘连接'}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={onSaveAiApiKey}>
              <Text style={styles.primaryButtonText}>保存复盘密钥</Text>
            </Pressable>
            <Pressable style={styles.destructiveButton} onPress={onClearAiApiKey}>
              <Text style={styles.destructiveButtonText}>清除复盘密钥</Text>
            </Pressable>
          </View>
        </Group>
      </>
    );
  }

  if (section === 'interviewProfile') {
    return (
      <>
        {backButton}
        <Group title="长期面试画像">
          <View style={styles.jobDetailPanel}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>整体画像</Text>
              <TextInput
                multiline
                style={styles.noteArea}
                textAlignVertical="top"
                value={userInterviewProfile.summary}
                onChangeText={(summary) => onUpdateInterviewProfile({ summary })}
                placeholder="完成两场以上复盘后逐步形成，也可以手动填写"
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>稳定优势</Text>
              <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={userInterviewProfile.stableStrengths.join('\n')} onChangeText={(value) => onUpdateInterviewProfile({ stableStrengths: splitLines(value) })} placeholder="一行一项" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>重复风险</Text>
              <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={userInterviewProfile.recurringRisks.join('\n')} onChangeText={(value) => onUpdateInterviewProfile({ recurringRisks: splitLines(value) })} placeholder="一行一项" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>当前训练重点</Text>
              <TextInput multiline style={styles.noteArea} textAlignVertical="top" value={userInterviewProfile.currentFocus.join('\n')} onChangeText={(value) => onUpdateInterviewProfile({ currentFocus: splitLines(value) })} placeholder="一行一项" />
            </View>
          </View>
        </Group>
        {userInterviewProfile.evidence.length ? (
          <Group title={`画像依据 · ${userInterviewProfile.evidence.length}`}>
            {userInterviewProfile.evidence.slice(0, 20).map((evidence) => {
              const interview = interviews.find((item) => item.id === evidence.interviewId);
              return (
                <ListRow
                  key={evidence.id}
                  title={evidence.text}
                  detail={interview ? `${interview.company} · ${interview.round}` : evidence.createdAt.slice(0, 10)}
                  onPress={interview ? () => onOpenInterviewTask(interview.id, 'review') : undefined}
                />
              );
            })}
          </Group>
        ) : null}
      </>
    );
  }

  if (section === 'preferences') {
    return (
      <>
        {backButton}
        <Group title="求职偏好">
          <View style={styles.jobDetailPanel}>
            <FormInput label="主要方向" value={userPreferences.targetDirections} onChangeText={(value) => onUpdatePreferences({ targetDirections: value })} placeholder="AI 应用 / FDE / 后端工程" />
            <FormInput label="优先城市" value={userPreferences.preferredCities} onChangeText={(value) => onUpdatePreferences({ preferredCities: value })} placeholder="广州、深圳、远程" />
            <FormInput label="当前策略" value={userPreferences.currentStrategy} onChangeText={(value) => onUpdatePreferences({ currentStrategy: value })} placeholder="优先推进已回复职位" />
            <FormInput label="提醒备注" value={userPreferences.reminderNote} onChangeText={(value) => onUpdatePreferences({ reminderNote: value })} placeholder="记录提醒偏好或求职节奏" />
          </View>
        </Group>
      </>
    );
  }

  if (section === 'data') {
    return (
      <>
        {backButton}
        <Group title="数据管理">
          <View style={styles.sectionBody}>
            <Text style={styles.paragraph}>删除操作会同步清除关联的本地录音、转写、复盘和编辑记录，已删除内容无法恢复。</Text>
          </View>
        </Group>
        <Group title="数据体检">
          {dataHealthRows.map((row) => (
            <ListRow key={row.title} title={row.title} detail={row.detail} />
          ))}
        </Group>
        <Group title="缓存清理">
          <View style={styles.sectionBody}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.flexOne}>
                <Text style={styles.rowTitle}>
                  {cacheBusy ? '正在检查缓存…' : cacheInspection ? `${formatStorageSize(cacheInspection.removableBytes)} 可清理` : '缓存状态暂不可用'}
                </Text>
                <Text style={styles.rowDetail}>
                  {cacheInspection
                    ? `${cacheInspection.removableFiles} 个临时文件${cacheInspection.protectedFiles ? ` · ${cacheInspection.protectedFiles} 个近期文件暂时保留` : ''}`
                    : '录音、转写、复盘、长期画像和本地模型不会被清理'}
                </Text>
              </View>
              <AppIcon name="trash" size={20} color="#6B7280" />
            </View>
            <Pressable
              style={[styles.secondaryButton, (cacheBusy || !cacheInspection?.removableFiles) && styles.buttonDisabled]}
              disabled={cacheBusy || !cacheInspection?.removableFiles}
              onPress={() => Alert.alert(
                '清理无用缓存？',
                `将删除 ${formatStorageSize(cacheInspection?.removableBytes ?? 0)} 临时文件。录音、转写、复盘和本地模型不会受影响。`,
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '清理',
                    onPress: () => {
                      setCacheBusy(true);
                      clearDisposableCache()
                        .then((result) => {
                          Alert.alert('清理完成', `已释放 ${formatStorageSize(result.clearedBytes)}，共 ${result.clearedFiles} 个临时文件。`);
                          return inspectDisposableCache();
                        })
                        .then(setCacheInspection)
                        .catch((error: unknown) => Alert.alert('清理失败', error instanceof Error ? error.message : '无法清理缓存。'))
                        .finally(() => setCacheBusy(false));
                    },
                  },
                ],
              )}
            >
              <Text style={styles.secondaryButtonText}>{cacheBusy ? '处理中…' : '清理无用缓存'}</Text>
            </Pressable>
            <Text style={styles.rowDetail}>应用生成的转写分片和导出临时文件可立即清理；其他近期文件保留 24 小时，避免打断正在进行的导入。</Text>
          </View>
        </Group>
        <Group title="本周求职报告">
          <View style={styles.dataPanel}>
            <Text style={styles.exportText}>{weeklyReport}</Text>
          </View>
        </Group>
        <Group title="Offer 决策记录">
          {offeredJobs.length ? (
            offeredJobs.map((job) => (
              <ListRow
                key={job.id}
                title={`${job.company} · ${job.title}`}
                detail={jobNotes[job.id]?.offerDecision || jobNotes[job.id]?.offerTotalPackage || '还没有记录决策结论'}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>还没有进入 Offer 的职位。</Text>
            </View>
          )}
        </Group>
        <Group title="备份与导出">
          <View style={styles.sectionBody}>
            <Pressable
              style={[styles.primaryButton, backupBusy && styles.buttonDisabled]}
              disabled={Boolean(backupBusy)}
              onPress={() => {
                setBackupBusy('create');
                onCreateFullBackup()
                  .catch((error: unknown) => Alert.alert('备份失败', error instanceof Error ? error.message : '完整备份没有成功生成。'))
                  .finally(() => setBackupBusy(null));
              }}
            >
              <Text style={styles.primaryButtonText}>{backupBusy === 'create' ? '正在整理完整备份…' : '创建完整备份'}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, backupBusy && styles.buttonDisabled]}
              disabled={Boolean(backupBusy)}
              onPress={() => Alert.alert('恢复完整备份？', '当前职位、面试、转写、复盘和录音关联将被备份内容覆盖。API Key 不受影响。', [
                { text: '取消', style: 'cancel' },
                {
                  text: '选择备份文件',
                  onPress: () => {
                    setBackupBusy('restore');
                    onRestoreFullBackup()
                      .catch((error: unknown) => Alert.alert('恢复失败', error instanceof Error ? error.message : '备份没有成功恢复。'))
                      .finally(() => setBackupBusy(null));
                  },
                },
              ])}
            >
              <Text style={styles.secondaryButtonText}>{backupBusy === 'restore' ? '正在恢复…' : '恢复完整备份'}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={shareExcelData}>
              <Text style={styles.primaryButtonText}>导出 Excel 表格</Text>
            </Pressable>
            <Text style={styles.rowDetail}>完整备份包含录音与应用数据，不包含任何 API Key；Excel 仅用于查看和整理。</Text>
          </View>
        </Group>
      </>
    );
  }

  if (section === 'privacy') {
    return (
      <>
        {backButton}
        <Group title="隐私与本地数据">
          <ListRow title="录音合规确认" detail="首次确认后会记住，不会每次开始录音都弹窗" />
          <ListRow title="默认本地" detail="职位、面试、录音和草稿默认保存在本机" />
          <ListRow title="AI 请求" detail="本地转写不上传音频；主动复盘时会发送本场转写、最近复盘摘要和长期画像，不发送录音" />
          <ListRow title="API Key" detail="截图识别与复盘密钥分别保存在系统安全存储，不进入本地 JSON 或 Excel 导出" />
          <ListRow title="音频文件" detail="保存到应用文档目录，可在面试详情里删除" />
          <ListRow title="导出预览" detail="导出内容会隐藏真实本地音频路径" />
        </Group>
      </>
    );
  }

  if (section === 'help') {
    return (
      <>
        {backButton}
        <Group title="帮助">
          <ListRow title="本地转写" detail="内置 Whisper 模型，支持离线长录音分段处理" />
          <ListRow title="AI 复盘" detail="服务地址填写到 /v1 即可，应用会自动补全请求路径" />
          <ListRow title="截图识别" detail="支持多张图片识别，并在确认后批量导入职位和面试" />
          <ListRow title="实际使用建议" detail="先从职位记录、面试录音、复盘备注三个流程开始用" />
        </Group>
      </>
    );
  }

  return (
    <>
      <View style={styles.profileSummaryCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>我</Text>
        </View>
        <View style={styles.profileSummaryCopy}>
          <Text style={styles.profileSummaryTitle}>我的求职档案</Text>
          <Text style={styles.profileSummaryMeta}>{activeJobsForMe.length} 个当前职位 · {activeInterviewsForMe.length} 场面试 · {savedAudioCount} 段录音</Text>
          <View style={styles.localStatusRow}>
            <View style={styles.localStatusDot} />
            <Text style={styles.localStatusText}>数据保存在本机</Text>
          </View>
        </View>
      </View>
      <Group title="现场展示">
        <ListRow
          title="HR 演示"
          detail="脱敏示例 · 对话证据、结构化复盘与行动建议"
          onPress={onOpenHrDemo}
        />
        <ListRow
          title="载入完整展示数据"
          detail="真实职位、面试准备、转写复盘与 Offer 对比"
          onPress={onLoadPresentationData}
        />
      </Group>
      <Group title="求职资料">
        <ListRow
          title="历史档案"
          detail={`${archivedJobList.length} 个已归档${archiveCandidates.length ? ` · ${archiveCandidates.length} 个建议整理` : ''}`}
          onPress={() => onSectionChange('archive')}
        />
        <ListRow
          title="简历版本"
          detail={`${resumeVersions.length} 个版本`}
          onPress={() => onSectionChange('resumes')}
        />
        <ListRow
          title="求职偏好"
          detail={userPreferences.targetDirections}
          onPress={() => onSectionChange('preferences')}
        />
        <ListRow
          title="长期面试画像"
          detail={userInterviewProfile.updatedAt ? `${userInterviewProfile.evidence.length} 条复盘依据` : '等待复盘积累'}
          onPress={() => onSectionChange('interviewProfile')}
        />
      </Group>
      <Group title="工具与服务">
        <ListRow
          title="AI 与转写"
          detail={aiApiKey && aiServiceSettings.reviewUrl ? '复盘服务已配置' : '本地转写可用'}
          onPress={() => onSectionChange('ai')}
        />
        <ListRow title="数据与导出" onPress={() => onSectionChange('data')} />
      </Group>
      <Group title="应用设置">
        <ListRow title="录音、存储与隐私" onPress={() => onSectionChange('privacy')} />
        <ListRow title="帮助与反馈" onPress={() => onSectionChange('help')} />
        <ListRow title="应用版本" detail="1.3.23 (27)" />
      </Group>
    </>
  );
}

function getScreenTitle(tab: TabId) {
  switch (tab) {
    case 'jobs':
      return '职位';
    case 'interviews':
      return '面试';
    case 'me':
      return '我的';
    default:
      return '今天';
  }
}

function buildOfferDecisionSummary(job: Job, note: JobNote) {
  if (job.status !== 'offered') {
    return {
      title: '尚未进入 Offer',
      detail: '可以提前记录期望薪资、福利和风险；职位状态推进到已录用后，这里会成为决策页。',
    };
  }

  const missingItems = [
    !hasText(note.offerTotalPackage) ? '总包' : '',
    !hasText(note.offerProbation) ? '试用期' : '',
    !hasText(note.offerRisks) ? '风险' : '',
    !hasText(note.offerDecision) ? '决策结论' : '',
  ].filter(Boolean);

  if (missingItems.length) {
    return {
      title: 'Offer 信息还不够完整',
      detail: `建议先补齐 ${missingItems.join('、')}，再决定接、拒或继续谈。`,
    };
  }

  if (hasText(note.offerNegotiation)) {
    return {
      title: '进入可决策状态',
      detail: '薪资结构、风险和谈薪动作都已有记录，可以和其他 Offer 或当前求职目标横向比较。',
    };
  }

  return {
    title: '建议补一轮谈薪记录',
    detail: '基础信息已齐，最好再记录谈薪口径、底线和对方回复，避免只凭感觉做决定。',
  };
}

function formatOfferMetricValue(value: string) {
  return value.replace(/^约\s*/u, '').replace(/\s*万$/u, '万').replace(/\s+/gu, ' ').trim();
}

function buildOfferComparison(jobs: Job[], notes: Record<number, JobNote>) {
  const values = jobs.map((job) => {
    const note = { ...emptyJobNote, ...(notes[job.id] ?? {}) };
    const compensation = note.offerTotalPackage || note.offerBaseSalary || job.salary || '未记录';
    return {
      jobId: job.id,
      company: job.company,
      compensation,
      cashValue: parseCompensationMidpoint(compensation),
      benefits: note.offerBenefits || '未记录',
      risks: note.offerRisks || '未记录',
      startDate: note.offerStartDate || '未记录',
    };
  });
  const highestCash = Math.max(0, ...values.map((item) => item.cashValue));
  return values.map((item) => ({
    ...item,
    isHighestCash: item.cashValue > 0 && item.cashValue === highestCash,
    opportunityCost: item.cashValue > 0 && highestCash > item.cashValue
      ? `可见现金口径比最高项低约 ${formatCompensationDifference(highestCash - item.cashValue)}`
      : '',
  }));
}

function parseCompensationMidpoint(value: string) {
  const match = value.toUpperCase().replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*[-–~至]\s*(\d+(?:\.\d+)?)\s*(K|W|万)?/u);
  if (!match) return 0;
  const unit = match[3] === 'K' ? 1000 : match[3] === 'W' || match[3] === '万' ? 10000 : 1;
  return ((Number(match[1]) + Number(match[2])) / 2) * unit;
}

function formatCompensationDifference(value: number) {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toString();
}

function recentMcpResearchSources(items: JobResearchItem[], now = new Date()): JobResearchSource[] {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return items.flatMap((item) => {
    const createdAt = new Date(item.createdAt).getTime();
    if (item.source !== 'xiaohongshu' || !item.note.startsWith('[MCP自动调研]') || !Number.isFinite(createdAt) || createdAt < cutoff) return [];
    return [{
      title: resolveStoredMcpResearchTitle(item.title, item.note),
      url: item.url,
      content: formatStoredMcpResearchContent(item.note),
      site: '小红书',
      publishedAt: item.createdAt.slice(0, 10),
    }];
  });
}

function mergeAutomaticResearchSummary(existing: string, summary: string) {
  const marker = '【小红书自动调研】';
  const cleaned = existing.replace(new RegExp(`\\n*${marker}[\\s\\S]*$`, 'u'), '').trim();
  return [cleaned, `${marker}\n${summary}`].filter(Boolean).join('\n\n');
}

function resultForInterview(interviewId: number, interviewResults: Record<number, InterviewResult>) {
  return interviewResults[interviewId] ?? '待反馈';
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function showAiRequestError(error: unknown, openSettings: () => void) {
  const message = error instanceof Error ? error.message : '请求没有成功完成，请检查网络和接口配置。';
  Alert.alert('AI 请求失败', message, [
    { text: '取消', style: 'cancel' },
    { text: '检查设置', onPress: openSettings },
  ]);
}

function buildHomeTodos(
  jobs: Job[],
  jobNotes: Record<number, JobNote>,
  interviews: Interview[],
  interviewDrafts: Record<number, InterviewDraft>,
  interviewResults: Record<number, InterviewResult>,
): HomeTodo[] {
  const interviewTodos: HomeTodo[] = interviews.flatMap<HomeTodo>((interview) => {
    const draft = interviewDrafts[interview.id];
    const reminderAt = draft?.reminderAt?.trim();
    const needsReview = interview.status === '待复盘' || Boolean(draft?.savedAudioUri && draft.audioWorkState !== 'reviewed');
    const needsFeedback = interview.status === '待反馈' && (interviewResults[interview.id] ?? '待反馈') === '待反馈';
    if (reminderAt) {
      return [{
        id: `interview-${interview.id}`,
        title: `${interview.company} · ${interview.round}`,
        detail: '待跟进',
        actionLabel: '去跟进',
        priority: '高' as const,
        target: { type: 'interview' as const, id: interview.id, section: 'followup' as const },
      }];
    }
    if (needsReview) {
      return [{
        id: `interview-${interview.id}`,
        title: `${interview.company} · ${interview.round}`,
        detail: draft?.transcript?.trim() ? '待复盘' : '待整理',
        actionLabel: '去复盘',
        priority: '高' as const,
        target: { type: 'interview' as const, id: interview.id, section: 'review' as const },
      }];
    }
    if (needsFeedback) {
      return [{
        id: `interview-${interview.id}`,
        title: `${interview.company} · ${interview.round}`,
        detail: '等待反馈',
        actionLabel: '填反馈',
        priority: '中' as const,
        target: { type: 'interview' as const, id: interview.id, section: 'followup' as const },
      }];
    }
    return [];
  });

  const explicitJobTodos: HomeTodo[] = jobs
    .filter((job) => hasText(jobNotes[job.id]?.nextAction))
    .map((job) => ({
      id: `job-action-${job.id}`,
      title: `${job.company} · ${job.title}`,
      detail: `下一步：${jobNotes[job.id]?.nextAction}`,
      actionLabel: '查看',
      priority: '中' as const,
      target: { type: 'job' as const, id: job.id, section: 'overview' as const },
    }));

  const offerTodos: HomeTodo[] = jobs
    .filter((job) => job.status === 'offered')
    .filter((job) => !hasText(jobNotes[job.id]?.offerDecision))
    .map((job) => ({
      id: `offer-${job.id}`,
      title: `${job.company} · ${job.title}`,
      detail: '已进入 Offer，补齐薪资、风险和决策结论',
      actionLabel: '去决策',
      priority: '高' as const,
      target: { type: 'job' as const, id: job.id, section: 'offer' as const },
    }));

  const missingJdTodos: HomeTodo[] = jobs
    .filter((job) => ['interested', 'preparing', 'applied', 'responded'].includes(job.status))
    .filter((job) => !hasText(jobNotes[job.id]?.jdSummary))
    .filter((job) => !hasText(jobNotes[job.id]?.nextAction))
    .slice(0, 3)
    .map((job) => ({
      id: `job-jd-${job.id}`,
      title: `${job.company} · ${job.title}`,
      detail: '还没有整理 JD 摘要，影响后续准备和复盘',
      actionLabel: '补充',
      priority: '低' as const,
      target: { type: 'job' as const, id: job.id, section: 'jd' as const },
    }));

  const jobTodos: HomeTodo[] = jobs
    .filter((job) => job.status === 'applied' || job.status === 'responded')
    .filter((job) => !hasText(jobNotes[job.id]?.nextAction))
    .map((job) => ({
      id: `job-follow-${job.id}`,
      title: `${job.company} · ${job.title}`,
      detail: job.status === 'applied' ? '已投递，建议跟进进度' : '已有回复，建议推进面试安排',
      actionLabel: job.status === 'applied' ? '去跟进' : '去推进',
      priority: job.status === 'responded' ? '高' as const : '中' as const,
      target: { type: 'job' as const, id: job.id, section: 'timeline' as const },
    }));

  return [
    ...interviewTodos,
    ...offerTodos,
    ...explicitJobTodos,
    ...jobTodos,
    ...missingJdTodos,
  ].slice(0, 8);
}

function buildDimensionRows(jobs: Job[], getLabel: (job: Job) => string) {
  const groups = new Map<string, Job[]>();
  jobs.forEach((job) => {
    const label = getLabel(job) || '未填写';
    groups.set(label, [...(groups.get(label) ?? []), job]);
  });

  return Array.from(groups.entries())
    .map(([label, items]) => {
      const applied = items.filter((job) =>
        ['applied', 'responded', 'interviewing', 'offered', 'ended'].includes(job.status),
      ).length;
      const responded = items.filter((job) => ['responded', 'interviewing', 'offered'].includes(job.status)).length;
      const offered = items.filter((job) => job.status === 'offered').length;
      const replyRate = applied ? Math.round((responded / applied) * 100) : 0;
      return {
        label,
        count: items.length,
        detail: `${items.length} 个职位 · 回复率 ${replyRate}% · Offer ${offered}`,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

type DimensionRow = ReturnType<typeof buildDimensionRows>[number];

function AnalysisColumn({ title, rows, total }: { title: string; rows: DimensionRow[]; total: number }) {
  return (
    <View style={styles.analysisColumn}>
      <Text style={styles.analysisColumnTitle}>{title}</Text>
      {rows.length ? rows.map((row) => {
        const percent = total ? Math.round((row.count / total) * 100) : 0;
        return (
          <View style={styles.analysisDataRow} key={row.label}>
            <View style={styles.analysisDataHeader}>
              <Text style={styles.analysisDataLabel} numberOfLines={1} ellipsizeMode="tail">{row.label}</Text>
              <Text style={styles.analysisDataValue}>{row.count}</Text>
              <Text style={styles.analysisPercent}>{percent}%</Text>
            </View>
            <View style={styles.analysisBar}><View style={[styles.analysisBarFill, { width: `${percent}%` }]} /></View>
          </View>
        );
      }) : <Text style={styles.rowDetail}>暂无数据</Text>}
    </View>
  );
}

function normalizePlatformLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'boss' || normalized.includes('boss直聘')) return 'Boss直聘';
  return value.trim() || '未填写';
}

function mergeDimensionRows(rows: DimensionRow[], normalize: (value: string) => string): DimensionRow[] {
  const merged = new Map<string, DimensionRow>();
  rows.forEach((row) => {
    const label = normalize(row.label);
    const current = merged.get(label);
    const count = (current?.count ?? 0) + row.count;
    merged.set(label, { label, count, detail: `${count} 个职位` });
  });
  return Array.from(merged.values()).sort((left, right) => right.count - left.count);
}

function isMeaningfulJdSummary(value: string) {
  const normalized = value.trim();
  return Boolean(normalized && !/手动新增的面试|请补充\s*JD|尚未填写/u.test(normalized));
}

function formatJdSummaryForDisplay(value: string) {
  return value
    .trim()
    .replace(/^(?:来自\s*)?(?:Boss\s*直聘\s*)?求职记录页截图(?:可见)?[：:]\s*/u, '')
    .replace(/^由招聘截图生成的可编辑识别结果[，,]\s*/u, '');
}

function HighlightedJdText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!text) return <Text style={styles.readingText}>暂未整理 JD 摘要。</Text>;
  const terms = Array.from(new Set([...keywords, 'Python', 'RAG', 'Agent', 'SQLite'].map((item) => item.trim()).filter(Boolean)));
  if (!terms.length) return <Text style={styles.readingText}>{text}</Text>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const matcher = new RegExp(`(${escaped.join('|')})`, 'giu');
  return (
    <Text style={styles.readingText}>
      {text.split(matcher).map((part, index) =>
        terms.some((term) => term.toLowerCase() === part.toLowerCase())
          ? <Text key={`${part}-${index}`} style={styles.transcriptHighlight}>{part}</Text>
          : part,
      )}
    </Text>
  );
}

function formatScreenshotSource(value: string) {
  const source = value.replace(/OCR|截图/giu, '').trim();
  return `${source || '招聘平台'}截图`;
}

function parseReminderDate(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  fallback.setMinutes(0, 0, 0);
  return fallback;
}

function parseRecordDate(value: string) {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = value.match(/(\d{1,2})月(\d{1,2})日/u);
  if (match) return new Date(new Date().getFullYear(), Number(match[1]) - 1, Number(match[2]));
  return new Date();
}

function formatRecordDate(value: Date) {
  return `${value.getMonth() + 1}月${value.getDate()}日`;
}

function formatReminderDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')} ${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function parseFollowUpRecords(value: string, legacyNote: string) {
  const records = value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = line.match(/^\[([^\]]+)\]\s*(.+)$/u);
    return match ? { time: match[1], body: match[2] } : { time: '已有记录', body: line };
  });
  if (legacyNote.trim()) records.push({ time: '面试备注', body: legacyNote.trim() });
  return records.reverse();
}

function buildEndReasonRows(jobs: Job[], jobNotes: Record<number, JobNote>) {
  const endedJobs = jobs.filter((job) => job.status === 'ended');
  const groups = new Map<string, number>();
  endedJobs.forEach((job) => {
    const reason = jobNotes[job.id]?.endReason || '未记录';
    groups.set(reason, (groups.get(reason) ?? 0) + 1);
  });

  return Array.from(groups.entries()).map(([label, count]) => ({
    label,
    detail: `${count} 个职位`,
  }));
}

function buildStrategySuggestions(
  jobs: Job[],
  interviews: Interview[],
  interviewDrafts: Record<number, InterviewDraft>,
  interviewResults: Record<number, InterviewResult>,
) {
  const suggestions: Array<{ title: string; detail: string }> = [];
  const pendingReview = interviews.filter((interview) => {
    const draft = interviewDrafts[interview.id];
    return draft?.savedAudioUri && draft.audioWorkState !== 'reviewed';
  }).length;
  const pendingFeedback = interviews.filter((interview) => (interviewResults[interview.id] ?? '待反馈') === '待反馈').length;
  const appliedNoResponse = jobs.filter((job) => job.status === 'applied').length;
  const missingJd = jobs.filter((job) => !job.tags.length || job.salary === '未填写').length;

  if (pendingReview) {
    suggestions.push({ title: '先补面试复盘', detail: `${pendingReview} 场面试已有录音但还没完成分析。` });
  }
  if (pendingFeedback) {
    suggestions.push({ title: '安排反馈跟进', detail: `${pendingFeedback} 场面试仍是待反馈，建议设置跟进时间。` });
  }
  if (appliedNoResponse) {
    suggestions.push({ title: '推进已投递职位', detail: `${appliedNoResponse} 个职位已投递但还没有回复。` });
  }
  if (missingJd) {
    suggestions.push({ title: '补齐职位信息', detail: `${missingJd} 个职位缺少薪资或关键词，会影响后续分析。` });
  }

  return suggestions.length
    ? suggestions.slice(0, 3)
    : [{ title: '保持记录节奏', detail: '当前没有明显阻塞，下一步可以继续新增职位或复盘最近一场面试。' }];
}

function extractInterviewQuestions(manualQuestions: string, transcript: string) {
  const source = manualQuestions.trim() || transcript;
  if (!manualQuestions.trim() && !/[？?。\n]/u.test(transcript)) return [];
  return source
    .split(/\n|。|？|\?/)
    .map((line) => line.trim())
    .filter((line) => line.length > 6)
    .filter((line) => /问|为什么|怎么|如何|是否|能不能|请|介绍|如果|what|how|why/i.test(line))
    .slice(0, 5);
}

function buildWeeklyReport(
  jobs: Job[],
  interviews: Interview[],
  jobEvents: Record<number, ApplicationEvent[]>,
  interviewDrafts: Record<number, InterviewDraft>,
  interviewResults: Record<number, InterviewResult>,
) {
  const now = new Date();
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);
  const recentEvents = Object.values(jobEvents).flat().filter((event) => {
    const time = new Date(event.eventTime).getTime();
    return Number.isFinite(time) && time >= since.getTime() && time <= now.getTime();
  });
  const recentJobIds = new Set(recentEvents.map((event) => event.jobId));
  const recentJobs = jobs.filter((job) => recentJobIds.has(job.id));
  const recentInterviews = interviews.filter((interview) => recentJobIds.has(interview.jobId));
  const metrics = calculateMetrics(recentJobs, recentInterviews);
  const reviewedCount = Object.values(interviewDrafts).filter((draft) => {
    if (draft.audioWorkState !== 'reviewed') return false;
    const time = new Date(draft.transcriptionUpdatedAt).getTime();
    return Number.isFinite(time) && time >= since.getTime() && time <= now.getTime();
  }).length;
  const pendingFeedback = interviews.filter((interview) => (interviewResults[interview.id] ?? '待反馈') === '待反馈').length;
  const topPlatform = buildDimensionRows(recentJobs, (job) => job.platform)[0]?.label ?? '暂无新增';
  const offerCount = new Set(recentEvents.filter((event) => event.toStatus === 'offered').map((event) => event.jobId)).size;
  const dailyTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(since);
    date.setDate(since.getDate() + index);
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const count = recentEvents.filter((event) => {
      const time = new Date(event.eventTime).getTime();
      return time >= date.getTime() && time < next.getTime();
    }).length;
    return `${formatShortDate(date.toISOString())} ${count}`;
  }).join(' · ');

  return [
    `近 7 天推进 ${recentJobIds.size} 个职位，产生 ${recentEvents.length} 次状态变化。`,
    `投递漏斗：已投递 ${metrics.applied}，有回复 ${metrics.responded}，面试职位 ${metrics.interviewCount}，Offer ${metrics.offered}。`,
    `每日推进：${dailyTrend}。`,
    `本周最高频渠道：${topPlatform}。`,
    `复盘进度：本周完成 ${reviewedCount} 场，当前待反馈 ${pendingFeedback} 场。`,
    `Offer 决策：本周 ${offerCount} 个职位进入 Offer。`,
    '建议：优先处理待反馈面试和已投递未推进职位，再补齐关键 JD 与面试问题记录。',
  ].join('\n');
}

function buildHomeMetricDetail(metricKey: HomeMetricKey, jobs: Job[], interviews: Interview[]) {
  if (metricKey === 'applied') {
    const rows = jobs
      .filter((job) => ['applied', 'responded', 'interviewing', 'offered', 'ended'].includes(job.status))
      .map((job) => ({
        title: `${job.company} · ${job.title}`,
        detail: `${statusMeta[job.status].label} · ${job.platform} · ${job.city} · ${job.salary}`,
      }));
    return { title: '已投递记录', summary: `${rows.length} 个职位进入投递后的跟进阶段。`, rows };
  }

  if (metricKey === 'replyRate') {
    const rows = jobs
      .filter((job) => ['responded', 'interviewing', 'offered'].includes(job.status))
      .map((job) => ({
        title: `${job.company} · ${job.title}`,
        detail: `${statusMeta[job.status].label} · ${job.platform} · ${job.city}`,
      }));
    return { title: '有回复记录', summary: `${rows.length} 个职位已有回复，可优先推进面试或跟进。`, rows };
  }

  if (metricKey === 'interviewRate') {
    const rows = interviews.map((interview) => ({
      title: `${interview.company} · ${interview.round}`,
      detail: `${formatInterviewSchedule(interview.startsAt, interview.id)} · ${interview.type} · ${interview.audioState}`,
    }));
    return { title: '面试记录', summary: `${rows.length} 场面试，包含待准备、待复盘和待反馈。`, rows };
  }

  const rows = jobs
    .filter((job) => job.status === 'offered')
    .map((job) => ({
      title: `${job.company} · ${job.title}`,
      detail: `${job.platform} · ${job.city} · ${job.salary}`,
    }));
  return { title: 'Offer 记录', summary: `${rows.length} 个职位已进入 Offer 阶段。`, rows };
}

function filterJobs(
  jobs: Job[],
  query: string,
  statusFilter: JobStatusFilter,
  platformFilter: string,
  cityFilter: string,
  resumeFilter: string,
) {
  const normalized = query.trim().toLowerCase();
  return jobs.filter((job) => {
    const statusMatched = matchesJobStatusFilter(job.status, statusFilter);
    const platformMatched = platformFilter === 'all' || job.platform === platformFilter;
    const cityMatched = cityFilter === 'all' || normalizeCityLabel(job.city) === cityFilter;
    const resumeMatched = resumeFilter === 'all' || job.resume === resumeFilter;
    const queryMatched =
      !normalized ||
      [job.company, job.title, job.platform, job.city, job.salary, ...job.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalized);

    return statusMatched && platformMatched && cityMatched && resumeMatched && queryMatched;
  });
}

function jobDateBasisLabel(value: JobDateBasis) {
  return ({
    activity: '最近动态',
    applied: '投递日期',
    interview: '面试日期',
    closed: '结束日期',
    created: '录入日期',
  } satisfies Record<JobDateBasis, string>)[value];
}

function dateRangeLabel(value: DateRangeValue) {
  if (value.preset === 'custom') return `${value.startDate} 至 ${value.endDate}`;
  return ({ '30d': '近30天', '90d': '近90天', year: '今年', all: '全部' } as const)[value.preset];
}

function filterInterviews(interviews: Interview[], query: string, listFilter: InterviewListFilter) {
  const normalized = query.trim().toLowerCase();
  return interviews.filter((interview) =>
    (listFilter === 'all' ||
      (listFilter === 'upcoming' && interview.status === '待面试') ||
      (listFilter === 'review' && interview.status === '待复盘') ||
      (listFilter === 'feedback' && interview.status === '待反馈')) &&
    (!normalized ||
      [interview.company, interview.title, interview.round, interview.type, interview.startsAt]
        .join(' ')
        .toLowerCase()
        .includes(normalized)),
  );
}

function splitTags(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function friendlyResumeName(value: string) {
  const name = value.trim();
  const builtInNames: Record<string, string> = {
    fde_ai_v3: 'AI 解决方案简历',
    ai_app_v2: 'AI 应用简历',
    backend_v1: '后端工程简历',
  };
  return builtInNames[name.toLowerCase()] ?? (name || '未命名简历');
}

function isAbortError(value: unknown) {
  return value instanceof Error && value.name === 'AbortError';
}

function createAbortError() {
  const error = new Error('请求已取消。');
  error.name = 'AbortError';
  return error;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function splitLines(value: string) {
  return value
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitReadableParagraphs(value: string) {
  return value
    .split(/\n{2,}|\n|。|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (/[。！？!?]$/.test(item) ? item : `${item}。`));
}

function extractTranscriptKeywords(value: string, jobTags: string[]) {
  const candidates = [...jobTags, 'Python', 'RAG', 'Agent', 'LLM', 'SQL', 'SQLite', 'Java', 'React', '财务系统', '数据库', '项目'];
  const normalized = value.toLowerCase();
  return Array.from(new Set(candidates.filter((item) => item && normalized.includes(item.toLowerCase())))).slice(0, 8);
}

function HighlightedTranscript({ text, keywords, numberOfLines }: { text: string; keywords: string[]; numberOfLines?: number }) {
  if (!keywords.length) return <Text style={styles.readingText} numberOfLines={numberOfLines}>{text}</Text>;
  const escaped = keywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matcher = new RegExp(`(${escaped.join('|')})`, 'gi');
  return (
    <Text style={styles.readingText} numberOfLines={numberOfLines}>
      {text.split(matcher).map((part, index) => (
        <Text key={`${part}-${index}`} style={keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase()) ? styles.transcriptHighlight : undefined}>{part}</Text>
      ))}
    </Text>
  );
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function summarizeConfidence(values?: Record<string, OcrConfidence>) {
  const levels = Object.values(values ?? {});
  if (levels.includes('low')) return '低 · 请重点核对';
  if (levels.length && levels.every((value) => value === 'high')) return '高';
  return '中';
}

function formatOcrConfidence(value: OcrConfidence) {
  return value === 'high' ? '高' : value === 'low' ? '低' : '中';
}

function getInterviewDateTimeKey(value: string, recordId?: number) {
  const parsed = resolveInterviewDateTime(value, recordId);
  return parsed ? formatInterviewDateTimeStorage(parsed) : normalizeText(value);
}

function formatOcrField(value: string) {
  const labels: Record<string, string> = {
    company: '公司', title: '岗位', salary: '薪资', city: '城市', recordDate: '日期', round: '轮次', startsAt: '时间', address: '地址', jdSummary: 'JD',
  };
  return labels[value] ?? value;
}

function getUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid-url';
  }
}

function isSimilarTitle(current: string, next: string) {
  const a = normalizeText(current);
  const b = normalizeText(next);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

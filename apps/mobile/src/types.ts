export type TabId = 'home' | 'jobs' | 'interviews' | 'me';

export type ApplicationStatus =
  | 'interested'
  | 'preparing'
  | 'applied'
  | 'responded'
  | 'interviewing'
  | 'offered'
  | 'ended';

export type EndReason =
  | '被拒'
  | '主动放弃'
  | '岗位关闭'
  | '长期无回应'
  | '薪资不匹配'
  | '地点不匹配'
  | '已接受其他 Offer'
  | '其他';

export type InterviewAudioState = '未录音' | '已录音' | '已转写' | '已分析';
export type InterviewResult = '待反馈' | '通过' | '未通过' | '进入下一轮';

export type Job = {
  id: number;
  company: string;
  title: string;
  platform: string;
  city: string;
  status: ApplicationStatus;
  salary: string;
  tags: string[];
  resume: string;
};

export type JobNote = {
  jobUrl: string;
  workMode: string;
  direction: string;
  companySize: string;
  experience: string;
  education: string;
  intentScore: string;
  sourceConfidence: string;
  screenshotName: string;
  applicationSource: string;
  recordGroup: string;
  contactMethod: string;
  recruiterName: string;
  applicationDate: string;
  recordDate: string;
  recordTime: string;
  recruitmentState: string;
  endReason: EndReason | '';
  jdSummary: string;
  nextAction: string;
  note: string;
  offerBaseSalary: string;
  offerBonus: string;
  offerTotalPackage: string;
  offerProbation: string;
  offerStartDate: string;
  offerBenefits: string;
  offerRisks: string;
  offerNegotiation: string;
  offerDecision: string;
};

export type JobResearchItem = {
  id: string;
  source: 'xiaohongshu' | 'nowcoder' | 'zhihu' | 'bilibili' | 'web';
  title: string;
  url: string;
  note: string;
  createdAt: string;
};

export type ApplicationEvent = {
  id: number;
  jobId: number;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  eventTime: string;
  note: string;
};

export type ResumeVersion = {
  id: number;
  name: string;
  targetRole: string;
  keywords: string[];
  fileName: string;
  content: string;
};

export type HrAnswerRecord = {
  id: string;
  question: string;
  answer: string;
  strategy: string;
  evidence: string[];
  caution: string;
  resumeName: string;
  createdAt: string;
};

export type UserPreferences = {
  targetDirections: string;
  preferredCities: string;
  currentStrategy: string;
  reminderNote: string;
};

export type TranscriptQaPair = {
  id: string;
  question: string;
  answer?: string;
  startSeconds: number;
  endSeconds: number;
  confidence: 'high' | 'medium' | 'low';
  sourceSegmentIndexes: number[];
  evidenceBlockIds?: string[];
  format?: 'qa' | 'group-topic';
  turns?: TranscriptQaTurn[];
};

export type TranscriptQaTurn = {
  id: string;
  speaker: string;
  text: string;
  role: 'self' | 'facilitator' | 'participant' | 'unknown';
  startSeconds: number;
  sourceSegmentIndexes: number[];
  evidenceBlockIds?: string[];
};

export type AiServiceSettings = {
  transcriptionProvider: 'local-sensevoice' | 'local-whisper' | 'tencent-flash';
  transcriptionUrl: string;
  transcriptionModel: string;
  tencentEngineType: string;
  reviewUrl: string;
  reviewModel: string;
  ocrUrl: string;
  ocrModel: string;
  researchMcpUrl?: string;
};

export type TencentAsrCredentials = {
  appId: string;
  secretId: string;
  secretKey: string;
};

export type Interview = {
  id: number;
  jobId: number;
  company: string;
  title: string;
  round: string;
  type: string;
  startsAt: string;
  status: '待面试' | '待复盘' | '待反馈';
  audioState: InterviewAudioState;
  jdSummary: string;
  checklist: string[];
};

export type AudioWorkState = 'empty' | 'saved' | 'transcribed' | 'reviewed';
export type RecordingHealth = 'unknown' | 'healthy' | 'quiet';
export type TranscriptionState = 'idle' | 'processing' | 'completed' | 'failed';

export type PreparationMaterialKind =
  | 'intro'
  | 'project'
  | 'company'
  | 'role'
  | 'technical'
  | 'questions'
  | 'reminder'
  | 'custom';

export type PreparationMaterial = {
  id: string;
  kind: PreparationMaterialKind;
  title: string;
  body: string;
  importance: 'high' | 'normal';
};

export type InterviewMode = 'individual' | 'group';

export type TranscriptEvidenceBlock = {
  id: string;
  parentId: 'transcript-root';
  parentSegmentIndex: number;
  speaker: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  approximateTime: boolean;
};

export type InterviewProfileEvidence = {
  id: string;
  interviewId: number;
  kind: 'strength' | 'risk' | 'progress' | 'focus';
  text: string;
  createdAt: string;
};

export type UserInterviewProfile = {
  summary: string;
  stableStrengths: string[];
  recurringRisks: string[];
  currentFocus: string[];
  evidence: InterviewProfileEvidence[];
  updatedAt: string;
};

export type InterviewDraft = {
  interviewMode: InterviewMode;
  selfSpeakerLabel: string;
  savedAudioUri: string | null;
  savedAudioName: string | null;
  audioDurationMillis: number;
  audioMimeType: string;
  recordingHealth: RecordingHealth;
  transcriptionState: TranscriptionState;
  transcriptionProvider: AiServiceSettings['transcriptionProvider'] | '';
  transcriptionError: string;
  transcriptionUpdatedAt: string;
  transcriptionCompletedParts: number;
  transcriptionTotalParts: number;
  audioWorkState: AudioWorkState;
  transcript: string;
  transcriptEvidenceBlocks: TranscriptEvidenceBlock[];
  transcriptQaPairs: TranscriptQaPair[];
  transcriptOrganizationState: 'idle' | 'processing' | 'completed' | 'failed';
  transcriptOrganizationError: string;
  transcriptOrganizationUpdatedAt: string;
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
  reviewQuestionDetails: InterviewQuestionReview[];
  reviewActionItems: string[];
  reviewProgressComparedWithPast: string;
  reviewRecurringPatterns: string[];
  reviewGenerationState: 'idle' | 'processing' | 'completed' | 'failed';
  reviewGenerationError: string;
  reviewGenerationUpdatedAt: string;
  questionsForInterviewer: string;
  followUpAction: string;
  reminderAt: string;
  recordMarkers: string[];
  preparationMaterials: PreparationMaterial[];
};

export type InterviewQuestionReview = {
  question: string;
  answerSummary: string;
  score: number;
  feedback: string;
  evidenceTime: string;
};

export type MockInterviewTurn = {
  id: string;
  question: string;
  audioUri: string | null;
  transcript: string;
  durationMillis: number;
  responseLatencyMillis: number;
  longPauseCount: number;
  longestPauseMillis: number;
  fillerCount: number;
  speechRate: number;
  createdAt: string;
};

export type MockInterviewReport = {
  overall: string;
  strengths: string[];
  risks: string[];
  nextSteps: string[];
};

export type MockInterviewSession = {
  id: string;
  jobId: number | null;
  title: string;
  round: string;
  status: 'active' | 'completed';
  targetQuestionCount: number;
  turns: MockInterviewTurn[];
  report: MockInterviewReport | null;
  createdAt: string;
  completedAt: string;
};

export type PersistedAppState = {
  selectedInterviewId: number;
  hasConfirmedRecordingCompliance: boolean;
  userPreferences: UserPreferences;
  userInterviewProfile: UserInterviewProfile;
  aiServiceSettings: AiServiceSettings;
  customJobs: Job[];
  customInterviews: Interview[];
  jobEdits: Record<number, Partial<Job>>;
  interviewEdits: Record<number, Partial<Interview>>;
  hiddenJobIds: number[];
  hiddenInterviewIds: number[];
  resumeVersions: ResumeVersion[];
  hrAnswerRecords: Record<number, HrAnswerRecord[]>;
  jobResearchItems: Record<number, JobResearchItem[]>;
  archivedJobs: Record<number, string>;
  archivedInterviews: Record<number, string>;
  jobResumeOverrides: Record<number, string>;
  jobNotes: Record<number, JobNote>;
  jobEvents: Record<number, ApplicationEvent[]>;
  interviewChecklistDone: Record<number, Record<string, boolean>>;
  interviewDrafts: Record<number, InterviewDraft>;
  interviewResults: Record<number, InterviewResult>;
  savedAudioUri: string | null;
  savedAudioName: string | null;
  audioWorkState: AudioWorkState;
  transcript: string;
  note: string;
  jobStatusOverrides: Record<number, ApplicationStatus>;
  interviewAudioStates: Record<number, InterviewAudioState>;
  mockInterviewSessions: MockInterviewSession[];
};

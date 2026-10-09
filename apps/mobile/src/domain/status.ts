import { statusOrder } from '../data/mockData';
import type { ApplicationStatus, AudioWorkState, InterviewAudioState, InterviewDraft } from '../types';

export function getNextApplicationStatus(status: ApplicationStatus) {
  if (status === 'interested' || status === 'preparing') return 'applied';
  const index = statusOrder.indexOf(status);
  return statusOrder[Math.min(index + 1, statusOrder.length - 1)];
}

export function getAudioStateFromWorkState(state: AudioWorkState): InterviewAudioState {
  switch (state) {
    case 'reviewed':
      return '已分析';
    case 'transcribed':
      return '已转写';
    case 'saved':
      return '已录音';
    default:
      return '未录音';
  }
}

export function getAudioWorkStateLabel(state: AudioWorkState) {
  switch (state) {
    case 'reviewed':
      return '已复盘';
    case 'transcribed':
      return '已转写';
    case 'saved':
      return '仅保存';
    default:
      return '待处理';
  }
}

export function createFreshAudioAnalysisPatch(): Pick<
  InterviewDraft,
  | 'transcriptionState'
  | 'transcriptionProvider'
  | 'transcriptionError'
  | 'transcriptionUpdatedAt'
  | 'transcriptionCompletedParts'
  | 'transcriptionTotalParts'
  | 'audioWorkState'
  | 'transcript'
  | 'transcriptEvidenceBlocks'
  | 'transcriptQaPairs'
  | 'transcriptOrganizationState'
  | 'transcriptOrganizationError'
  | 'transcriptOrganizationUpdatedAt'
  | 'transcriptOrganizationCompletedChunks'
  | 'transcriptOrganizationTotalChunks'
  | 'manualQuestions'
  | 'improvedAnswer'
  | 'reviewOverall'
  | 'reviewStrengths'
  | 'reviewRisks'
  | 'reviewScores'
  | 'reviewQuestionDetails'
  | 'reviewActionItems'
  | 'recordMarkers'
> {
  return {
    transcriptionState: 'idle',
    transcriptionProvider: '',
    transcriptionError: '',
    transcriptionUpdatedAt: '',
    transcriptionCompletedParts: 0,
    transcriptionTotalParts: 0,
    audioWorkState: 'saved',
    transcript: '',
    transcriptEvidenceBlocks: [],
    transcriptQaPairs: [],
    transcriptOrganizationState: 'idle',
    transcriptOrganizationError: '',
    transcriptOrganizationUpdatedAt: '',
    transcriptOrganizationCompletedChunks: 0,
    transcriptOrganizationTotalChunks: 0,
    manualQuestions: '',
    improvedAnswer: '',
    reviewOverall: '',
    reviewStrengths: '',
    reviewRisks: '',
    reviewScores: {},
    reviewQuestionDetails: [],
    reviewActionItems: [],
    recordMarkers: [],
  };
}

export function hasResumableTranscript(
  transcript: string,
  completedParts: number,
  totalParts: number,
) {
  return Boolean(transcript.trim()) && completedParts > 0 && completedParts < totalParts;
}

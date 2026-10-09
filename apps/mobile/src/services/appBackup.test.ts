import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'android' } }));
vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/' }));
vi.mock('expo-sharing', () => ({}));
import { parseEnvelope, prepareBackup, restoreAudioUris } from './appBackup';
import type { PersistedAppState } from '../types';

function state(): PersistedAppState {
  return {
    selectedInterviewId: 1,
    hasConfirmedRecordingCompliance: true,
    userPreferences: { targetDirections: '', preferredCities: '', currentStrategy: '', reminderNote: '' },
    userInterviewProfile: { summary: '', stableStrengths: [], recurringRisks: [], currentFocus: [], evidence: [], updatedAt: '' },
    aiServiceSettings: { transcriptionProvider: 'local-sensevoice', transcriptionUrl: '', transcriptionModel: '', tencentEngineType: '', reviewUrl: '', reviewModel: '', ocrUrl: '', ocrModel: '', researchMcpUrl: '' },
    customJobs: [], customInterviews: [], jobEdits: {}, interviewEdits: {}, hiddenJobIds: [], hiddenInterviewIds: [], resumeVersions: [], hrAnswerRecords: {}, jobResearchItems: {}, archivedJobs: {}, archivedInterviews: {}, jobResumeOverrides: {}, jobNotes: {}, jobEvents: {}, interviewChecklistDone: {}, interviewResults: {}, jobStatusOverrides: {}, interviewAudioStates: {},
    interviewDrafts: { 1: { savedAudioUri: 'file:///audio/a.m4a', savedAudioName: 'a.m4a' } as PersistedAppState['interviewDrafts'][number] },
    savedAudioUri: 'file:///audio/a.m4a', savedAudioName: 'a.m4a', audioWorkState: 'saved', transcript: '', note: '',
    mockInterviewSessions: [],
  };
}

describe('full backup manifest', () => {
  it('deduplicates audio and restores its local uri', () => {
    const prepared = prepareBackup(state());
    expect(prepared.audioEntries).toHaveLength(1);
    const parsed = parseEnvelope(JSON.stringify(prepared.envelope));
    const restored = restoreAudioUris(parsed.state, { 'audio/0001-a.m4a': 'file:///restored/a.m4a' });
    expect(restored.interviewDrafts[1].savedAudioUri).toBe('file:///restored/a.m4a');
    expect(restored.savedAudioUri).toBe('file:///restored/a.m4a');
  });

  it('rejects unrelated json', () => {
    expect(() => parseEnvelope('{"version":1}')).toThrow('OfferJing');
  });
});

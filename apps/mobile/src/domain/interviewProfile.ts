import type { InterviewProfileEvidence, UserInterviewProfile } from '../types';

export const emptyInterviewProfile: UserInterviewProfile = {
  summary: '',
  stableStrengths: [],
  recurringRisks: [],
  currentFocus: [],
  evidence: [],
  updatedAt: '',
};

export type InterviewProfileUpdate = {
  summary: string;
  strengths: string[];
  risks: string[];
  progress: string;
  recurringPatterns: string[];
  nextFocus: string[];
};

export function mergeInterviewProfile(
  profile: UserInterviewProfile,
  update: InterviewProfileUpdate,
  interviewId: number,
  createdAt: string,
): UserInterviewProfile {
  const evidence = [
    ...createEvidence(update.strengths, 'strength', interviewId, createdAt),
    ...createEvidence(update.recurringPatterns.length ? update.recurringPatterns : update.risks, 'risk', interviewId, createdAt),
    ...createEvidence(update.progress ? [update.progress] : [], 'progress', interviewId, createdAt),
    ...createEvidence(update.nextFocus, 'focus', interviewId, createdAt),
    ...profile.evidence,
  ].filter((item, index, items) => items.findIndex((other) => other.interviewId === item.interviewId && other.kind === item.kind && normalize(other.text) === normalize(item.text)) === index)
    .slice(0, 60);

  return {
    summary: update.summary.trim() || profile.summary,
    stableStrengths: mergeValues(profile.stableStrengths, update.strengths, 8),
    recurringRisks: mergeValues(profile.recurringRisks, update.recurringPatterns.length ? update.recurringPatterns : update.risks, 8),
    currentFocus: update.nextFocus.length ? uniqueValues(update.nextFocus).slice(0, 6) : profile.currentFocus,
    evidence,
    updatedAt: createdAt,
  };
}

function createEvidence(values: string[], kind: InterviewProfileEvidence['kind'], interviewId: number, createdAt: string) {
  return uniqueValues(values).map((text, index) => ({
    id: `${interviewId}-${kind}-${createdAt}-${index}`,
    interviewId,
    kind,
    text,
    createdAt,
  }));
}

function mergeValues(current: string[], incoming: string[], limit: number) {
  return uniqueValues([...incoming, ...current]).slice(0, limit);
}

function uniqueValues(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).filter((value, index, items) => items.findIndex((item) => normalize(item) === normalize(value)) === index);
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/gu, '');
}

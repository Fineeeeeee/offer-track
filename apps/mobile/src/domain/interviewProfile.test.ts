import { describe, expect, it } from 'vitest';
import { emptyInterviewProfile, mergeInterviewProfile } from './interviewProfile';

describe('interview profile', () => {
  it('merges review evidence and keeps the newest focus', () => {
    const profile = mergeInterviewProfile(emptyInterviewProfile, {
      summary: '表达有结构，但证据仍需加强。',
      strengths: ['先说结论'],
      risks: ['项目数据不足'],
      progress: '比上一场更早给出结论。',
      recurringPatterns: ['项目数据不足'],
      nextFocus: ['补充量化结果'],
    }, 12, '2026-08-10T10:00:00.000Z');

    expect(profile.stableStrengths).toEqual(['先说结论']);
    expect(profile.recurringRisks).toEqual(['项目数据不足']);
    expect(profile.currentFocus).toEqual(['补充量化结果']);
    expect(profile.evidence.some((item) => item.interviewId === 12 && item.kind === 'progress')).toBe(true);
  });
});

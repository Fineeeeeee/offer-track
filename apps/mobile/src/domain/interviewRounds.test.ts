import { describe, expect, it } from 'vitest';
import { inferNextInterviewRound } from './interviewRounds';

describe('interview round progression', () => {
  it('advances common Chinese round labels', () => {
    expect(inferNextInterviewRound('一面')).toBe('二面');
    expect(inferNextInterviewRound('复试')).toBe('终面');
  });

  it('advances numeric rounds and falls back to a retest', () => {
    expect(inferNextInterviewRound('第 2 轮')).toBe('第 3 轮');
    expect(inferNextInterviewRound('业务主管面')).toBe('复试');
  });
});

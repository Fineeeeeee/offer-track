import { describe, expect, it } from 'vitest';
import {
  formatInterviewDateTimeStorage,
  formatInterviewSchedule,
  normalizeInterviewDateTime,
  resolveInterviewDateTime,
} from './interviewDateTime';

describe('interview date time', () => {
  const now = new Date(2026, 7, 10, 8, 0);

  it('stores a selected date as an absolute local date time', () => {
    expect(formatInterviewDateTimeStorage(new Date(2026, 7, 10, 15, 30))).toBe('2026-08-10 15:30');
  });

  it('derives today and tomorrow from the current device date', () => {
    expect(formatInterviewSchedule('2026-08-10 15:30', undefined, now)).toBe('今天 15:30');
    expect(formatInterviewSchedule('2026-08-11 10:00', undefined, now)).toBe('明天 10:00');
  });

  it('normalizes OCR relative dates at import time', () => {
    expect(normalizeInterviewDateTime('明天 15:30', now)).toBe('2026-08-11 15:30');
    expect(normalizeInterviewDateTime('8月12日 09:00', now)).toBe('2026-08-12 09:00');
  });

  it('anchors legacy relative text to the record creation date', () => {
    const createdAt = new Date(2026, 6, 17, 12, 0).getTime();
    const resolved = resolveInterviewDateTime('明天 10:00', createdAt, new Date(2026, 7, 10));
    expect(formatInterviewDateTimeStorage(resolved!)).toBe('2026-07-18 10:00');
  });
});

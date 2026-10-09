import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { readInterviewId } from './notifications';

describe('notification navigation data', () => {
  it('accepts numeric interview ids and rejects invalid values', () => {
    const response = (value: unknown) => ({ notification: { request: { content: { data: { interviewId: value } } } } }) as never;
    expect(readInterviewId(response(42))).toBe(42);
    expect(readInterviewId(response('42'))).toBe(42);
    expect(readInterviewId(response('job-42'))).toBeNull();
    expect(readInterviewId(null)).toBeNull();
  });
});

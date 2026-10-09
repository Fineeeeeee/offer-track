import { describe, expect, it } from 'vitest';
import { getNextApplicationStatus } from './status';

describe('getNextApplicationStatus', () => {
  it('skips the optional preparing state during manual progression', () => {
    expect(getNextApplicationStatus('interested')).toBe('applied');
    expect(getNextApplicationStatus('preparing')).toBe('applied');
  });

  it('does not wrap an ended job back to interested', () => {
    expect(getNextApplicationStatus('ended')).toBe('ended');
  });
});

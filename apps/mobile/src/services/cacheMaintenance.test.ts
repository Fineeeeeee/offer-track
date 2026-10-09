import { describe, expect, it } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

import { vi } from 'vitest';
import { isDisposableCacheFile } from './cacheMaintenance';

describe('cache maintenance', () => {
  const now = new Date('2026-08-10T12:00:00Z').getTime();

  it('allows app-generated temporary files to be cleared immediately', () => {
    expect(isDisposableCacheFile('offerjing-sensevoice-input.wav', now / 1000, now)).toBe(true);
    expect(isDisposableCacheFile('OfferJing-2026.offerjing', now / 1000, now)).toBe(true);
  });

  it('protects recent picker files and clears stale ones', () => {
    expect(isDisposableCacheFile('interview.m4a', (now - 60_000) / 1000, now)).toBe(false);
    expect(isDisposableCacheFile('job-screenshot.jpg', (now - 25 * 60 * 60 * 1000) / 1000, now)).toBe(true);
  });

  it('protects entries without a trustworthy modification time', () => {
    expect(isDisposableCacheFile('unknown.bin', 0, now)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  evaluateRecordingStorage,
  formatStorageSize,
  LOW_RECORDING_FREE_BYTES,
  MIN_RECORDING_FREE_BYTES,
} from './recordingSafety';

describe('recording storage safety', () => {
  it('blocks storage that cannot safely hold a long recording', () => {
    expect(evaluateRecordingStorage(MIN_RECORDING_FREE_BYTES - 1)).toBe('blocked');
  });

  it('warns before storage becomes critical', () => {
    expect(evaluateRecordingStorage(MIN_RECORDING_FREE_BYTES)).toBe('low');
    expect(evaluateRecordingStorage(LOW_RECORDING_FREE_BYTES)).toBe('ok');
  });

  it('formats storage for compact mobile status text', () => {
    expect(formatStorageSize(90 * 1024 * 1024)).toBe('90 MB');
    expect(formatStorageSize(2.25 * 1024 * 1024 * 1024)).toBe('2.3 GB');
  });
});

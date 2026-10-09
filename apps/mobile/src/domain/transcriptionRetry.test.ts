import { describe, expect, it, vi } from 'vitest';
import { retryTranscriptionSegment } from './transcriptionRetry';

describe('retryTranscriptionSegment', () => {
  it('retries one transient segment failure', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue('转写结果');
    await expect(retryTranscriptionSegment(task)).resolves.toBe('转写结果');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('surfaces the final error after retries are exhausted', async () => {
    const task = vi.fn().mockRejectedValue(new Error('failed'));
    await expect(retryTranscriptionSegment(task)).rejects.toThrow('failed');
    expect(task).toHaveBeenCalledTimes(2);
  });
});

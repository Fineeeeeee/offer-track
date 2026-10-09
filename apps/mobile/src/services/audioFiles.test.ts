import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeDirectoryAsync, copyAsync, moveAsync, getInfoAsync, deleteAsync } = vi.hoisted(() => ({
  makeDirectoryAsync: vi.fn(),
  copyAsync: vi.fn(),
  moveAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));
const { getNativeAudioDurationMillis, remuxAacToM4a } = vi.hoisted(() => ({
  getNativeAudioDurationMillis: vi.fn().mockResolvedValue(120_000),
  remuxAacToM4a: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getFreeDiskStorageAsync: vi.fn(),
  getTotalDiskCapacityAsync: vi.fn(),
  makeDirectoryAsync,
  copyAsync,
  moveAsync,
  getInfoAsync,
  deleteAsync,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('./audioConversion', () => ({ getNativeAudioDurationMillis, remuxAacToM4a }));

import { createSeekableAudioCopy, deleteAudioFile, persistAudioFile } from './audioFiles';

describe('audio file persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates a temporary copy before moving it into the permanent audio directory', async () => {
    getInfoAsync
      .mockResolvedValueOnce({ exists: true, size: 8_000 })
      .mockResolvedValueOnce({ exists: true, size: 8_000 });

    const saved = await persistAudioFile('file:///cache/interview.m4a', '面试录音.m4a', 10_000);
    expect(makeDirectoryAsync).toHaveBeenCalledWith('file:///documents/audio/', { intermediates: true });
    expect(copyAsync).toHaveBeenCalledWith(expect.objectContaining({ from: 'file:///cache/interview.m4a' }));
    expect(moveAsync).toHaveBeenCalledOnce();
    expect(saved.sizeBytes).toBe(8_000);
    expect(saved.uri).toMatch(/^file:\/\/\/documents\/audio\/\d+-/);
  });

  it('does not move a truncated recording into the permanent path', async () => {
    getInfoAsync.mockResolvedValueOnce({ exists: true, size: 1_500 });
    await expect(persistAudioFile('file:///cache/interview.m4a', 'interview.m4a', 10_000))
      .rejects.toThrow('录音文件校验失败');
    expect(moveAsync).not.toHaveBeenCalled();
  });

  it('deletes only an existing file owned by the app document directory', async () => {
    getInfoAsync.mockResolvedValueOnce({ exists: true, size: 8_000 });
    await deleteAudioFile('file:///documents/audio/interview.m4a');
    expect(deleteAsync).toHaveBeenCalledWith('file:///documents/audio/interview.m4a', { idempotent: true });

    await deleteAudioFile('file:///downloads/external.m4a');
    expect(deleteAsync).toHaveBeenCalledTimes(1);
  });

  it('remuxes imported m4a files once for reliable seeking', async () => {
    const normalized = await createSeekableAudioCopy('file:///documents/audio/source.m4a', '录音.m4a');
    expect(remuxAacToM4a).toHaveBeenCalledWith(
      'file:///documents/audio/source.m4a',
      expect.stringMatching(/-seekable\.m4a$/),
    );
    expect(normalized.durationMillis).toBe(120_000);

    await createSeekableAudioCopy(normalized.uri, normalized.fileName);
    expect(remuxAacToM4a).toHaveBeenCalledTimes(1);
  });
});

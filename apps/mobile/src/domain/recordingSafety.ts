export const MIN_RECORDING_FREE_BYTES = 64 * 1024 * 1024;
export const LOW_RECORDING_FREE_BYTES = 256 * 1024 * 1024;

export type RecordingStorageLevel = 'ok' | 'low' | 'blocked';

export function evaluateRecordingStorage(freeBytes: number): RecordingStorageLevel {
  if (!Number.isFinite(freeBytes) || freeBytes < MIN_RECORDING_FREE_BYTES) return 'blocked';
  if (freeBytes < LOW_RECORDING_FREE_BYTES) return 'low';
  return 'ok';
}

export function formatStorageSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024 * 1024) return `${Math.max(1, Math.floor(bytes / 1024 / 1024))} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

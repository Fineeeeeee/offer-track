import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNativeAudioDurationMillis, remuxAacToM4a } from './audioConversion';

const AUDIO_DIR = `${FileSystem.documentDirectory ?? ''}audio/`;
const ACTIVE_RECORDING_KEY = 'offer-jing:active-recording:v1';

export type PersistedAudioFile = {
  uri: string;
  sizeBytes: number;
};

export async function getRecordingStorageInfo() {
  const [freeBytes, totalBytes] = await Promise.all([
    FileSystem.getFreeDiskStorageAsync(),
    FileSystem.getTotalDiskCapacityAsync(),
  ]);
  return { freeBytes, totalBytes };
}

export async function getAudioFileSize(fileUri: string | null) {
  if (!fileUri) return 0;
  const info = await FileSystem.getInfoAsync(fileUri);
  return info.exists ? getFileSize(info) : 0;
}

export async function getAudioDurationMillis(fileUri: string | null) {
  if (!fileUri) return 0;
  return getNativeAudioDurationMillis(fileUri);
}

export async function createSeekableAudioCopy(sourceUri: string, fileName: string) {
  const durationMillis = await getAudioDurationMillis(sourceUri).catch(() => 0);
  const canRemux = /\.(?:aac|m4a|mp4)$/i.test(fileName);
  if (!canRemux || !FileSystem.documentDirectory || /-seekable\.m4a(?:$|[?#])/i.test(sourceUri)) {
    return { uri: sourceUri, fileName, durationMillis };
  }
  await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  const safeStem = fileName.replace(/\.(?:aac|m4a|mp4)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const outputUri = `${AUDIO_DIR}${Date.now()}-${safeStem || 'imported-audio'}-seekable.m4a`;
  await remuxAacToM4a(sourceUri, outputUri);
  const normalizedDuration = await getAudioDurationMillis(outputUri).catch(() => durationMillis);
  return {
    uri: outputUri,
    fileName: fileName.replace(/\.(?:aac|m4a|mp4)$/i, '.m4a'),
    durationMillis: normalizedDuration || durationMillis,
  };
}

export type ActiveRecordingMarker = {
  interviewId: number;
  startedAt: string;
  sourceUri: string;
  fileName: string;
};

export async function persistAudioFile(
  sourceUri: string,
  fileName: string,
  expectedDurationMillis = 0,
): Promise<PersistedAudioFile> {
  if (FileSystem.documentDirectory && sourceUri.startsWith(FileSystem.documentDirectory)) {
    const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
    const sourceSize = sourceInfo.exists ? getFileSize(sourceInfo) : 0;
    validateFileSize(sourceSize, expectedDurationMillis);
    return { uri: sourceUri, sizeBytes: sourceSize };
  }
  if (!FileSystem.documentDirectory) {
    const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!sourceInfo.exists) {
      throw new Error('录音文件不存在，无法保存。');
    }
    const sourceSize = getFileSize(sourceInfo);
    validateFileSize(sourceSize, expectedDurationMillis);
    return { uri: sourceUri, sizeBytes: sourceSize };
  }

  await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = Date.now();
  const destination = `${AUDIO_DIR}${id}-${safeName}`;
  const partialDestination = `${AUDIO_DIR}.${id}-${safeName}.partial`;

  await FileSystem.copyAsync({
    from: sourceUri,
    to: partialDestination,
  });

  const partialInfo = await FileSystem.getInfoAsync(partialDestination);
  const sizeBytes = partialInfo.exists ? getFileSize(partialInfo) : 0;
  validateFileSize(partialInfo.exists ? sizeBytes : 0, expectedDurationMillis);

  await FileSystem.moveAsync({ from: partialDestination, to: destination });
  const finalInfo = await FileSystem.getInfoAsync(destination);
  const finalSize = finalInfo.exists ? getFileSize(finalInfo) : 0;
  if (!finalInfo.exists || finalSize !== sizeBytes) {
    throw new Error('录音文件写入后校验不一致。原始录音仍保留，可稍后恢复。');
  }

  return { uri: destination, sizeBytes: finalSize };
}

export function saveActiveRecordingMarker(marker: ActiveRecordingMarker) {
  return AsyncStorage.setItem(ACTIVE_RECORDING_KEY, JSON.stringify(marker));
}

export async function updateActiveRecordingSource(sourceUri: string) {
  if (!sourceUri) return;
  const marker = await loadActiveRecordingMarker();
  if (!marker || marker.sourceUri === sourceUri) return;
  await saveActiveRecordingMarker({ ...marker, sourceUri });
}

export async function loadActiveRecordingMarker(): Promise<ActiveRecordingMarker | null> {
  const raw = await AsyncStorage.getItem(ACTIVE_RECORDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ActiveRecordingMarker>;
    if (typeof value.interviewId !== 'number' || !value.startedAt || !value.fileName) {
      return null;
    }
    return {
      interviewId: value.interviewId,
      startedAt: value.startedAt,
      sourceUri: value.sourceUri ?? '',
      fileName: value.fileName,
    };
  } catch {
    return null;
  }
}

export function clearActiveRecordingMarker() {
  return AsyncStorage.removeItem(ACTIVE_RECORDING_KEY);
}

export async function recoverActiveRecording() {
  const marker = await loadActiveRecordingMarker();
  if (!marker) return null;
  if (!marker.sourceUri) {
    return { marker, recovered: null };
  }
  const sourceInfo = await FileSystem.getInfoAsync(marker.sourceUri);
  if (!sourceInfo.exists || getFileSize(sourceInfo) < 1_024) {
    return { marker, recovered: null };
  }
  const recovered = await persistAudioFile(marker.sourceUri, marker.fileName);
  await clearActiveRecordingMarker();
  return { marker, recovered };
}

export async function deleteAudioFile(fileUri: string | null) {
  if (!fileUri || !FileSystem.documentDirectory || !fileUri.startsWith(FileSystem.documentDirectory)) {
    return;
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }
}

function getFileSize(info: FileSystem.FileInfo) {
  return 'size' in info && typeof info.size === 'number' ? info.size : 0;
}

function formatBytes(value: number) {
  if (value < 1_024 * 1_024) return `${Math.max(0, Math.round(value / 1_024))}KB`;
  return `${(value / 1_024 / 1_024).toFixed(1)}MB`;
}

function validateFileSize(sizeBytes: number, expectedDurationMillis: number) {
  const minimumBytes = expectedDurationMillis > 0
    ? Math.max(1_024, Math.floor((expectedDurationMillis / 1_000) * 500))
    : 1_024;
  if (sizeBytes < minimumBytes) {
    throw new Error(`录音文件校验失败：保存文件只有 ${formatBytes(sizeBytes)}。原始录音仍保留，可稍后恢复。`);
  }
}

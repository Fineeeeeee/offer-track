import { NativeModules, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { PersistedAppState } from '../types';

const BACKUP_FORMAT = 'offerjing-full-backup';
const BACKUP_VERSION = 1;
const BACKUP_URI_PREFIX = 'backup://';

type BackupAudioEntry = { sourceUri: string; archivePath: string };
type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  state: PersistedAppState;
};

type NativeBackupModule = {
  createBackup: (manifest: string, audioEntries: BackupAudioEntry[], outputPath: string) => Promise<string>;
  restoreBackup: (inputPath: string, audioDirectory: string) => Promise<{ manifest: string; audioFiles: Record<string, string> }>;
};

export async function createAndShareFullBackup(state: PersistedAppState) {
  const module = getNativeModule();
  const { envelope, audioEntries } = prepareBackup(state);
  const cacheDirectory = requireDirectory(FileSystem.cacheDirectory, '缓存目录');
  const stamp = envelope.createdAt.replace(/[:.]/g, '-');
  const outputUri = `${cacheDirectory}OfferJing-${stamp}.offerjing`;
  const backupUri = await module.createBackup(JSON.stringify(envelope), audioEntries, outputUri);
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持文件分享。');
  await Sharing.shareAsync(backupUri, {
    mimeType: 'application/zip',
    dialogTitle: '保存 OfferJing 完整备份',
    UTI: 'public.zip-archive',
  });
  return { audioCount: audioEntries.length, backupUri };
}

export async function pickAndRestoreFullBackup() {
  const module = getNativeModule();
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const audioDirectory = `${requireDirectory(FileSystem.documentDirectory, '应用目录')}audio/`;
  await FileSystem.makeDirectoryAsync(audioDirectory, { intermediates: true });
  const restored = await module.restoreBackup(result.assets[0].uri, audioDirectory);
  const envelope = parseEnvelope(restored.manifest);
  return restoreAudioUris(envelope.state, restored.audioFiles);
}

export function prepareBackup(state: PersistedAppState) {
  const backupState = JSON.parse(JSON.stringify(state)) as PersistedAppState;
  const audioEntries: BackupAudioEntry[] = [];
  const archivedBySource = new Map<string, string>();
  const register = (sourceUri: string | null, name: string) => {
    if (!sourceUri?.startsWith('file://')) return null;
    const existing = archivedBySource.get(sourceUri);
    if (existing) return `${BACKUP_URI_PREFIX}${existing}`;
    const safeName = sanitizeFileName(name || sourceUri.split('/').at(-1) || 'recording.m4a');
    const archivePath = `audio/${String(audioEntries.length + 1).padStart(4, '0')}-${safeName}`;
    archivedBySource.set(sourceUri, archivePath);
    audioEntries.push({ sourceUri, archivePath });
    return `${BACKUP_URI_PREFIX}${archivePath}`;
  };

  Object.entries(backupState.interviewDrafts).forEach(([id, draft]) => {
    draft.savedAudioUri = register(draft.savedAudioUri, draft.savedAudioName || `interview-${id}.m4a`);
  });
  backupState.mockInterviewSessions.forEach((session) => {
    session.turns.forEach((turn, index) => {
      turn.audioUri = register(turn.audioUri, `mock-${session.id}-${index + 1}.m4a`);
    });
  });
  backupState.savedAudioUri = register(backupState.savedAudioUri, backupState.savedAudioName || 'current-interview.m4a');

  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    state: backupState,
  };
  return { envelope, audioEntries };
}

export function parseEnvelope(value: string): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('备份文件不是有效的 OfferJing 数据。');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('备份文件结构无效。');
  const envelope = parsed as Partial<BackupEnvelope>;
  if (envelope.format !== BACKUP_FORMAT) throw new Error('这不是 OfferJing 完整备份文件。');
  if (envelope.version !== BACKUP_VERSION) throw new Error(`暂不支持备份版本 ${String(envelope.version)}。`);
  if (!envelope.state || !Array.isArray(envelope.state.customJobs) || !Array.isArray(envelope.state.customInterviews)) {
    throw new Error('备份缺少职位或面试数据。');
  }
  return envelope as BackupEnvelope;
}

export function restoreAudioUris(state: PersistedAppState, audioFiles: Record<string, string>) {
  const restored = JSON.parse(JSON.stringify(state)) as PersistedAppState;
  const resolve = (value: string | null) => {
    if (!value?.startsWith(BACKUP_URI_PREFIX)) return value;
    const archivePath = value.slice(BACKUP_URI_PREFIX.length);
    return audioFiles[archivePath] ?? null;
  };
  Object.values(restored.interviewDrafts).forEach((draft) => {
    draft.savedAudioUri = resolve(draft.savedAudioUri);
  });
  restored.mockInterviewSessions.forEach((session) => {
    session.turns.forEach((turn) => {
      turn.audioUri = resolve(turn.audioUri);
    });
  });
  restored.savedAudioUri = resolve(restored.savedAudioUri);
  return restored;
}

function getNativeModule() {
  const module = NativeModules.OfferJingBackup as NativeBackupModule | undefined;
  if (Platform.OS !== 'android' || !module) {
    throw new Error('当前安装包不支持完整备份，请安装最新版 OfferJing。');
  }
  return module;
}

function requireDirectory(value: string | null, label: string) {
  if (!value) throw new Error(`${label}不可用。`);
  return value;
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'recording.m4a';
}

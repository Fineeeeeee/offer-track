import { Directory, File, Paths } from 'expo-file-system';
import { Buffer } from 'buffer';
import type { ModelMetaBase } from 'react-native-sherpa-onnx/download';
import type { SttEngine } from 'react-native-sherpa-onnx/stt';
import { retryTranscriptionSegment } from '../domain/transcriptionRetry';
import { addLocalTerminalPunctuation } from '../domain/transcriptPunctuation';
import { convertAudioToWav16k as convertAudioWithFallback } from './audioConversion';

const SENSEVOICE_PATTERN = /sense[-_ ]?voice/i;
const STANDARD_SENSEVOICE_PATTERN =
  /^sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-\d{4}-\d{2}-\d{2}$/i;
const HARDWARE_SPECIFIC_PATTERN = /(?:^|[-_])(qnn|rk\d+|ascend|linux|android-aarch64)(?:[-_]|$)/i;
const TEMP_WAV_NAME = 'offerjing-sensevoice-input.wav';
const TEMP_SEGMENT_NAME = 'offerjing-sensevoice-segment.wav';
const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SECOND = 16_000 * 2;
const CHUNK_SECONDS = 2 * 60;
const OVERLAP_SECONDS = 3;

let enginePromise: Promise<SttEngine> | null = null;
let activeModelPath = '';

type ReactNativeFs = {
  appendFile: (path: string, contents: string, encoding: 'base64') => Promise<void>;
  read: (path: string, length: number, position: number, encoding: 'base64') => Promise<string>;
  stat: (path: string) => Promise<{ size: string | number }>;
  writeFile: (path: string, contents: string, encoding: 'base64') => Promise<void>;
};

export type SenseVoiceModelProgress = {
  percent: number;
  phase: 'checking' | 'downloading' | 'extracting' | 'ready';
};

export async function getSenseVoiceModelStatus() {
  const { download } = getSenseVoiceNative();
  const candidate = await findDownloadedModel();
  if (candidate) {
    const localPath = await download.getLocalModelPathByCategory(download.ModelCategory.Stt, candidate.id);
    if (localPath) {
      return { ready: true as const, modelId: candidate.id, localPath };
    }
  }
  const installed = findInstalledSenseVoiceDirectory();
  return installed ?? { ready: false as const, modelId: candidate?.id ?? '', localPath: '' };
}

export async function prepareSenseVoiceModel(
  onProgress?: (progress: SenseVoiceModelProgress) => void,
) {
  const { download } = getSenseVoiceNative();
  onProgress?.({ percent: 0, phase: 'checking' });
  const existing = await getSenseVoiceModelStatus();
  if (existing.ready) {
    onProgress?.({ percent: 100, phase: 'ready' });
    return existing;
  }

  const models = await download.refreshModelsByCategory<ModelMetaBase>(download.ModelCategory.Stt);
  const candidate = pickSenseVoiceModel(models);
  if (!candidate) {
    throw new Error('官方模型列表中没有找到 SenseVoice，请检查网络后重试。');
  }
  const result = await download.ensureModelByCategory(download.ModelCategory.Stt, candidate.id, {
    deleteArchiveAfterExtract: true,
    onProgress: (progress) => {
      onProgress?.({
        percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
        phase: progress.phase === 'extracting' ? 'extracting' : 'downloading',
      });
    },
  });
  onProgress?.({ percent: 100, phase: 'ready' });
  return { ready: true as const, modelId: result.modelId, localPath: result.localPath };
}

export async function transcribeWithSenseVoice({
  audioUri,
  onProgress,
  onPartialTranscript,
  resume,
}: {
  audioUri: string;
  onProgress?: (progress: { completed: number; total: number }) => void;
  onPartialTranscript?: (text: string, completed: number, total: number) => void;
  resume?: { completedParts: number; totalParts: number; transcript: string };
}) {
  const { convertAudioToWav16k } = getSenseVoiceNative();
  onProgress?.({ completed: 0, total: 100 });
  const model = await prepareSenseVoiceModel((progress) => {
    const modelPercent = Math.round(progress.percent * 0.7);
    onProgress?.({ completed: modelPercent, total: 100 });
  });

  const inputPath = normalizeNativePath(audioUri);
  const source = new File(audioUri);
  if (!source.exists) {
    throw new Error('录音文件不存在，请先确认它仍可正常播放。');
  }

  const wavFile = new File(Paths.cache, TEMP_WAV_NAME);
  onProgress?.({ completed: 72, total: 100 });
  await convertAudioWithFallback(inputPath, normalizeNativePath(wavFile.uri), convertAudioToWav16k);

  const engine = await getSenseVoiceEngine(model.localPath);
  onProgress?.({ completed: 75, total: 100 });
  const text = await transcribeWavInChunks(
    engine,
    normalizeNativePath(wavFile.uri),
    onProgress,
    onPartialTranscript,
    resume,
  );
  if (!text) {
    throw new Error('SenseVoice 没有识别到清晰语音，请先试听原录音并检查音量。');
  }
  onProgress?.({ completed: 100, total: 100 });
  return text;
}

async function transcribeWavInChunks(
  engine: SttEngine,
  wavPath: string,
  onProgress?: (progress: { completed: number; total: number }) => void,
  onPartialTranscript?: (text: string, completed: number, total: number) => void,
  resume?: { completedParts: number; totalParts: number; transcript: string },
) {
  const { RNFS } = getSenseVoiceNative();
  const file = await RNFS.stat(wavPath);
  const dataBytes = Math.max(0, Number(file.size) - WAV_HEADER_BYTES);
  if (!dataBytes) {
    throw new Error('转换后的音频为空，请确认原录音仍可正常播放。');
  }

  const chunkBytes = CHUNK_SECONDS * PCM_BYTES_PER_SECOND;
  const overlapBytes = OVERLAP_SECONDS * PCM_BYTES_PER_SECOND;
  const total = Math.ceil(dataBytes / chunkBytes);
  const segmentFile = new File(Paths.cache, TEMP_SEGMENT_NAME);
  const segmentPath = normalizeNativePath(segmentFile.uri);
  const savedParts = splitSavedTranscript(resume?.transcript ?? '');
  const resumeFrom = resume?.totalParts === total && savedParts.length >= resume.completedParts
    ? Math.min(total, Math.max(0, resume.completedParts))
    : 0;
  const parts: string[] = resumeFrom > 0 ? savedParts.slice(0, resumeFrom) : [];
  if (resumeFrom > 0) {
    onProgress?.({ completed: 75 + Math.round((resumeFrom / total) * 25), total: 100 });
  }

  for (let index = resumeFrom; index < total; index += 1) {
    const mainStart = index * chunkBytes;
    const mainEnd = Math.min(dataBytes, (index + 1) * chunkBytes);
    const segmentStart = Math.max(0, mainStart - (index > 0 ? overlapBytes : 0));
    const segmentEnd = Math.min(dataBytes, mainEnd + (index < total - 1 ? overlapBytes : 0));
    const segmentLength = segmentEnd - segmentStart;
    const audioBase64 = await RNFS.read(
      wavPath,
      segmentLength,
      WAV_HEADER_BYTES + segmentStart,
      'base64',
    );
    await RNFS.writeFile(segmentPath, createWavHeader(segmentLength), 'base64');
    await RNFS.appendFile(segmentPath, audioBase64, 'base64');

    const result = await retryTranscriptionSegment(() => engine.transcribeFile(segmentPath));
    const recognized = addLocalTerminalPunctuation(result.text);
    if (recognized) {
      const startSeconds = mainStart / PCM_BYTES_PER_SECOND;
      const endSeconds = mainEnd / PCM_BYTES_PER_SECOND;
      parts.push(
        total > 1
          ? `【${formatTimestamp(startSeconds)}-${formatTimestamp(endSeconds)}】\n${recognized}`
          : recognized,
      );
    }
    onPartialTranscript?.(parts.join('\n\n').trim(), index + 1, total);
    onProgress?.({ completed: 75 + Math.round(((index + 1) / total) * 25), total: 100 });
  }

  return parts.join('\n\n').trim();
}

function splitSavedTranscript(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.split(/\n\n(?=【)/g).filter(Boolean) : [];
}

function createWavHeader(dataBytes: number) {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(PCM_BYTES_PER_SECOND, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  return header.toString('base64');
}

function formatTimestamp(valueSeconds: number) {
  const totalSeconds = Math.max(0, Math.floor(valueSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function getSenseVoiceEngine(modelPath: string) {
  const { createSTT } = getSenseVoiceNative();
  if (!enginePromise || activeModelPath !== modelPath) {
    activeModelPath = modelPath;
    enginePromise = createSTT({
      modelPath: { type: 'file', path: modelPath },
      modelType: 'sense_voice',
      preferInt8: true,
      numThreads: 4,
      provider: 'cpu',
      modelOptions: {
        senseVoice: { language: 'zh', useItn: true },
      },
    }).catch((error) => {
      enginePromise = null;
      activeModelPath = '';
      throw error;
    });
  }
  return enginePromise;
}

async function findDownloadedModel() {
  const { download } = getSenseVoiceNative();
  const models = await download.listDownloadedModelsByCategory<ModelMetaBase>(download.ModelCategory.Stt);
  return pickSenseVoiceModel(models);
}

function findInstalledSenseVoiceDirectory() {
  const root = new Directory(Paths.document, 'sherpa-onnx', 'models', 'stt');
  if (!root.exists) {
    return null;
  }
  for (const entry of root.list()) {
    if (!(entry instanceof Directory) || !SENSEVOICE_PATTERN.test(entry.name)) {
      continue;
    }
    const modelDirectory = entry.list().find(
      (child): child is Directory => child instanceof Directory && SENSEVOICE_PATTERN.test(child.name),
    ) ?? entry;
    const readyMarker = new File(entry, '.ready');
    const modelFile = new File(modelDirectory, 'model.int8.onnx');
    const tokensFile = new File(modelDirectory, 'tokens.txt');
    if (readyMarker.exists && modelFile.exists && tokensFile.exists) {
      return { ready: true as const, modelId: entry.name, localPath: entry.uri };
    }
  }
  return null;
}

function getSenseVoiceNative() {
  try {
    const loadedFs = require('react-native-fs') as { default?: ReactNativeFs } & Partial<ReactNativeFs>;
    const RNFS = (loadedFs.default ?? loadedFs) as ReactNativeFs;
    const download = require('react-native-sherpa-onnx/download') as typeof import('react-native-sherpa-onnx/download');
    const audio = require('react-native-sherpa-onnx/audio') as typeof import('react-native-sherpa-onnx/audio');
    const stt = require('react-native-sherpa-onnx/stt') as typeof import('react-native-sherpa-onnx/stt');
    if (!RNFS.stat || !download.ModelCategory || !audio.convertAudioToWav16k || !stt.createSTT) {
      throw new Error('missing-native-module');
    }
    return {
      RNFS,
      download,
      convertAudioToWav16k: audio.convertAudioToWav16k,
      createSTT: stt.createSTT,
    };
  } catch {
    throw new Error('当前运行环境不包含 SenseVoice 原生模块。请使用已安装的 OfferJing 完整版进行本地转写。');
  }
}

function pickSenseVoiceModel(models: ModelMetaBase[]) {
  const standardModels = models
    .filter((model) => STANDARD_SENSEVOICE_PATTERN.test(model.id))
    .sort((left, right) => right.id.localeCompare(left.id));
  if (standardModels.length) {
    return standardModels[0];
  }
  return models
    .filter((model) => SENSEVOICE_PATTERN.test(model.id) || SENSEVOICE_PATTERN.test(model.displayName))
    .filter((model) => !HARDWARE_SPECIFIC_PATTERN.test(model.id))
    .filter((model) => !model.id.toLowerCase().includes('funasr-nano'))
    .sort((left, right) => {
      const int8Delta = Number(right.id.toLowerCase().includes('int8')) - Number(left.id.toLowerCase().includes('int8'));
      return int8Delta || left.bytes - right.bytes;
    })[0] ?? null;
}

function normalizeNativePath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

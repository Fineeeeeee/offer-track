import { Buffer } from 'safe-buffer';
import { File, Paths } from 'expo-file-system';
import type { WhisperContext } from 'whisper.rn';
import { retryTranscriptionSegment } from '../domain/transcriptionRetry';
import { addLocalTerminalPunctuation, formatLocalTranscriptSegments } from '../domain/transcriptPunctuation';
import { convertAudioToWav16k } from './audioConversion';

const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const MODEL_ASSET = require('../../assets/models/ggml-small-q5_1.db');
const TEMP_WAV_NAME = 'offerjing-whisper-input.wav';

let contextPromise: Promise<WhisperContext> | null = null;

type ReactNativeFs = {
  DocumentDirectoryPath: string;
  appendFile: (path: string, contents: string, encoding: 'base64') => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string) => Promise<void>;
  stat: (path: string) => Promise<{ size: string | number }>;
  write: (path: string, contents: string, position: number, encoding: 'base64') => Promise<void>;
  writeFile: (path: string, contents: string, encoding: 'base64') => Promise<void>;
};

type LiveAudioStreamApi = {
  init: (options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource: number;
    bufferSize: number;
    wavFile: string;
  }) => void;
  on: (event: 'data', callback: (data: string) => void) => void;
  start: () => void;
  stop: () => Promise<void>;
};

export type LocalAudioRecording = {
  fileName: string;
  uri: string;
};

export class LocalAudioRecordingSession {
  private writeChain: Promise<void> = Promise.resolve();
  private dataSize = 0;
  private stopped = false;

  private constructor(
    private readonly filePath: string,
    private readonly fileName: string,
  ) {}

  static async start(label: string) {
    const RNFS = getReactNativeFs();
    const directory = `${RNFS.DocumentDirectoryPath}/audio`;
    await RNFS.mkdir(directory);
    const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'interview';
    const fileName = `${Date.now()}-${safeLabel}.wav`;
    const session = new LocalAudioRecordingSession(`${directory}/${fileName}`, fileName);
    await session.begin();
    return session;
  }

  private async begin() {
    const RNFS = getReactNativeFs();
    const LiveAudioStream = getLiveAudioStream();
    await RNFS.writeFile(this.filePath, createWavHeader(0), 'base64');
    LiveAudioStream.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      audioSource: 6,
      bufferSize: 16 * 1024,
      wavFile: '',
    });
    LiveAudioStream.on('data', (data: string) => {
      this.dataSize += getBase64ByteLength(data);
      this.writeChain = this.writeChain.then(() => RNFS.appendFile(this.filePath, data, 'base64'));
    });
    LiveAudioStream.start();
  }

  async stop(): Promise<LocalAudioRecording> {
    if (!this.stopped) {
      const RNFS = getReactNativeFs();
      const LiveAudioStream = getLiveAudioStream();
      this.stopped = true;
      await LiveAudioStream.stop();
      await this.writeChain;
      await RNFS.write(this.filePath, createWavHeader(this.dataSize), 0, 'base64');
    }
    return { fileName: this.fileName, uri: `file://${this.filePath}` };
  }
}

function createWavHeader(dataSize: number) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  header.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return header.toString('base64');
}

function getBase64ByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export async function transcribeLocalAudio(
  audioUri: string,
  onProgress?: (progress: { completed: number; total: number }) => void,
  onPartialTranscript?: (text: string, completed: number, total: number) => void,
  resume?: { completedParts: number; totalParts: number; transcript: string },
) {
  let filePath = normalizeNativePath(audioUri);
  const RNFS = getReactNativeFs();
  if (!(await RNFS.exists(filePath))) {
    throw new Error('录音文件不存在，请确认录音仍可正常播放。');
  }
  if (!audioUri.toLowerCase().split(/[?#]/)[0].endsWith('.wav')) {
    const wavFile = new File(Paths.cache, TEMP_WAV_NAME);
    onProgress?.({ completed: 0, total: 1 });
    await convertAudioToWav16k(filePath, normalizeNativePath(wavFile.uri), getAudioConverter());
    filePath = normalizeNativePath(wavFile.uri);
  }

  const context = await getWhisperContext();
  const file = await RNFS.stat(filePath);
  const bytesPerSecond = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const durationMs = Math.max(1, Math.floor(((Number(file.size) - 44) / bytesPerSecond) * 1000));
  const chunkDurationMs = 10 * 60 * 1000;
  const total = Math.ceil(durationMs / chunkDurationMs);
  const savedParts = splitSavedTranscript(resume?.transcript ?? '');
  const resumeFrom = resume?.totalParts === total && savedParts.length >= resume.completedParts
    ? Math.min(total, Math.max(0, resume.completedParts))
    : 0;
  const parts: string[] = resumeFrom > 0 ? savedParts.slice(0, resumeFrom) : [];
  if (resumeFrom > 0) {
    onProgress?.({ completed: resumeFrom, total });
  }

  for (let index = resumeFrom; index < total; index += 1) {
    const offset = index * chunkDurationMs;
    const duration = Math.min(chunkDurationMs, durationMs - offset);
    const result = await retryTranscriptionSegment(async () => {
      const { promise } = context.transcribe(filePath, {
        language: 'zh',
        translate: false,
        maxThreads: 6,
        offset,
        duration,
      });
      return promise;
    });
    const part = formatLocalTranscriptSegments(result.segments, offset)
      || addLocalTerminalPunctuation(result.result);
    if (part) {
      parts.push(total > 1 ? `【${formatChunkTime(offset)}-${formatChunkTime(offset + duration)}】\n${part}` : part);
    }
    onPartialTranscript?.(parts.join('\n\n').trim(), index + 1, total);
    onProgress?.({ completed: index + 1, total });
  }

  const text = parts.join('\n\n').trim();
  if (!text) {
    throw new Error('本地模型没有识别到清晰语音，请确认录音音量后重试。');
  }
  return text;
}

function splitSavedTranscript(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.split(/\n\n(?=【)/g).filter(Boolean) : [];
}

function normalizeNativePath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function formatChunkTime(valueMs: number) {
  const totalSeconds = Math.floor(valueMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getWhisperContext() {
  if (!contextPromise) {
    const initWhisper = getInitWhisper();
    contextPromise = initWhisper({
      filePath: MODEL_ASSET,
      useGpu: false,
      useFlashAttn: false,
    }).catch((error) => {
      contextPromise = null;
      throw error;
    });
  }
  return contextPromise;
}

function getReactNativeFs() {
  try {
    const loaded = require('react-native-fs') as { default?: ReactNativeFs } & Partial<ReactNativeFs>;
    const module = (loaded.default ?? loaded) as ReactNativeFs;
    if (!module.DocumentDirectoryPath) {
      throw new Error('missing-native-module');
    }
    return module;
  } catch {
    throw new Error('当前运行环境不包含本地录音模块。请使用已安装的 OfferJing 完整版，本地录音和离线转写无法在 Expo Go 中运行。');
  }
}

function getLiveAudioStream() {
  try {
    const loaded = require('@fugood/react-native-audio-pcm-stream/index.js') as
      { default?: LiveAudioStreamApi } & Partial<LiveAudioStreamApi>;
    const module = (loaded.default ?? loaded) as LiveAudioStreamApi;
    if (!module.init || !module.start || !module.stop) {
      throw new Error('missing-native-module');
    }
    return module;
  } catch {
    throw new Error('当前运行环境不包含本地录音模块。请使用已安装的 OfferJing 完整版，本地录音和离线转写无法在 Expo Go 中运行。');
  }
}

function getAudioConverter() {
  try {
    const loaded = require('react-native-sherpa-onnx/audio') as {
      convertAudioToWav16k?: (inputPath: string, outputPath: string) => Promise<void>;
    };
    if (!loaded.convertAudioToWav16k) {
      throw new Error('missing-native-module');
    }
    return loaded.convertAudioToWav16k;
  } catch {
    throw new Error('当前运行环境不包含音频转换模块。请使用已安装的 OfferJing 完整版进行离线转写。');
  }
}

function getInitWhisper() {
  try {
    const loaded = require('whisper.rn') as { initWhisper?: typeof import('whisper.rn').initWhisper };
    if (!loaded.initWhisper) {
      throw new Error('missing-native-module');
    }
    return loaded.initWhisper;
  } catch {
    throw new Error('当前运行环境不包含 Whisper 模型运行库。请使用已安装的 OfferJing 完整版进行离线转写。');
  }
}

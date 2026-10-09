import { Buffer } from 'buffer';
import { File, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { TencentAsrCredentials } from '../types';
import { createAudioChunkPlan } from '../domain/audioChunking';
import { convertAudioToWav16k as convertAudioWithFallback } from './audioConversion';

const HOST = 'asr.cloud.tencent.com';
const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SECOND = 16_000 * 2;
const CHUNK_SECONDS = 10 * 60;
const OVERLAP_SECONDS = 2;
const MAX_ATTEMPTS = 3;

type TencentFlashSentence = { text?: unknown; start_time?: unknown; end_time?: unknown };
type TencentFlashChannel = { text?: unknown; sentence_list?: unknown };
type TencentFlashResponse = { code?: unknown; message?: unknown; request_id?: unknown; flash_result?: unknown };
type ReactNativeFs = {
  appendFile: (path: string, contents: string, encoding: 'base64') => Promise<void>;
  read: (path: string, length: number, position: number, encoding: 'base64') => Promise<string>;
  stat: (path: string) => Promise<{ size: string | number }>;
  writeFile: (path: string, contents: string, encoding: 'base64') => Promise<void>;
};

class TencentRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export async function transcribeWithTencentFlash({
  audioUri,
  audioName: _audioName,
  engineType,
  credentials,
  onProgress,
  onPartialTranscript,
  resume,
}: {
  audioUri: string;
  audioName: string;
  engineType: string;
  credentials: TencentAsrCredentials;
  onProgress?: (progress: { completed: number; total: number }) => void;
  onPartialTranscript?: (text: string, completed: number, total: number) => void;
  resume?: { completedParts: number; totalParts: number; transcript: string };
}) {
  requireCredential(credentials.appId, '腾讯云 AppID');
  requireCredential(credentials.secretId, '腾讯云 SecretID');
  requireCredential(credentials.secretKey, '腾讯云 SecretKey');
  requireCredential(engineType, '腾讯云识别引擎');

  const source = new File(audioUri);
  if (!source.exists) throw new Error('录音文件不存在，请先确认它仍可正常播放。');

  const { RNFS, convertAudioToWav16k } = getNativeAudioTools();
  const wavFile = new File(Paths.cache, 'offerjing-tencent-input.wav');
  await convertAudioWithFallback(
    normalizeNativePath(audioUri),
    normalizeNativePath(wavFile.uri),
    convertAudioToWav16k,
  );
  const wavPath = normalizeNativePath(wavFile.uri);
  const stat = await RNFS.stat(wavPath);
  const dataBytes = Math.max(0, Number(stat.size) - WAV_HEADER_BYTES);
  if (!dataBytes) throw new Error('转换后的音频为空，请先确认原录音仍可正常播放。');

  const chunks = createAudioChunkPlan({ dataBytes, bytesPerSecond: PCM_BYTES_PER_SECOND, chunkSeconds: CHUNK_SECONDS, overlapSeconds: OVERLAP_SECONDS });
  const total = chunks.length;
  const savedParts = splitSavedTranscript(resume?.transcript ?? '');
  const resumeFrom = resume?.totalParts === total && savedParts.length >= resume.completedParts
    ? Math.min(total, Math.max(0, resume.completedParts))
    : 0;
  const parts = resumeFrom ? savedParts.slice(0, resumeFrom) : [];
  const segment = new File(Paths.cache, 'offerjing-tencent-segment.wav');
  const segmentPath = normalizeNativePath(segment.uri);
  onProgress?.({ completed: resumeFrom, total });

  for (let index = resumeFrom; index < total; index += 1) {
    const { mainStart, mainEnd, segmentStart, segmentEnd } = chunks[index];
    const segmentLength = segmentEnd - segmentStart;
    const audioBase64 = await RNFS.read(wavPath, segmentLength, WAV_HEADER_BYTES + segmentStart, 'base64');
    await RNFS.writeFile(segmentPath, createWavHeader(segmentLength), 'base64');
    await RNFS.appendFile(segmentPath, audioBase64, 'base64');

    const offsetMs = Math.floor((segmentStart / PCM_BYTES_PER_SECOND) * 1000);
    const recognized = await withRetry(() => transcribeSegment({
      file: segment,
      engineType,
      credentials,
      offsetMs,
    }));
    if (recognized) {
      const startSeconds = mainStart / PCM_BYTES_PER_SECOND;
      const endSeconds = mainEnd / PCM_BYTES_PER_SECOND;
      parts.push(total > 1 ? `【${formatTimestamp(startSeconds * 1000)}-${formatTimestamp(endSeconds * 1000)}】\n${recognized}` : recognized);
    }
    const partial = parts.join('\n\n').trim();
    onPartialTranscript?.(partial, index + 1, total);
    onProgress?.({ completed: index + 1, total });
  }

  const transcript = parts.join('\n\n').trim();
  if (!transcript) throw new Error('腾讯云识别成功，但没有返回可读取的转写文本。');
  return transcript;
}

async function transcribeSegment({
  file,
  engineType,
  credentials,
  offsetMs,
}: {
  file: File;
  engineType: string;
  credentials: TencentAsrCredentials;
  offsetMs: number;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = `/asr/flash/v1/${credentials.appId.trim()}`;
  const params = {
    convert_num_mode: '1', engine_type: engineType.trim(), filter_dirty: '0', filter_modal: '0',
    filter_punc: '0', first_channel_only: '1', secretid: credentials.secretId.trim(),
    speaker_diarization: '0', timestamp, voice_format: 'wav', word_info: '1',
  };
  const query = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const signature = Buffer.from(hmac(sha1, utf8ToBytes(credentials.secretKey.trim()), utf8ToBytes(`POST${HOST}${path}?${query}`))).toString('base64');

  let response: Response;
  try {
    response = await fetch(`https://${HOST}${path}?${query}`, {
      method: 'POST',
      headers: { Authorization: signature, 'Content-Length': String(file.size), 'Content-Type': 'application/octet-stream' },
      body: file,
    });
  } catch (error) {
    throw new TencentRequestError(error instanceof Error ? error.message : '腾讯云网络请求失败。', true);
  }
  const raw = await response.text();
  let payload: TencentFlashResponse;
  try {
    payload = JSON.parse(raw) as TencentFlashResponse;
  } catch {
    throw new TencentRequestError(`腾讯云返回了无法解析的结果（HTTP ${response.status}）。`, response.status >= 500 || response.status === 429);
  }
  if (!response.ok || payload.code !== 0) {
    const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : `请求失败（HTTP ${response.status}）`;
    const requestId = typeof payload.request_id === 'string' ? `\n请求 ID：${payload.request_id}` : '';
    throw new TencentRequestError(`${message}${requestId}`, response.status >= 500 || response.status === 429);
  }
  return formatTencentTranscript(payload.flash_result, offsetMs);
}

async function withRetry<T>(task: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (error instanceof TencentRequestError && !error.retryable) throw error;
      if (attempt < MAX_ATTEMPTS) await delay(700 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export function formatTencentTranscript(value: unknown, offsetMs = 0) {
  if (!Array.isArray(value)) return '';
  const channels = value as TencentFlashChannel[];
  const sentences = channels.flatMap((channel) => Array.isArray(channel.sentence_list) ? channel.sentence_list as TencentFlashSentence[] : []);
  const timestamped = sentences.map((sentence) => {
    const text = typeof sentence.text === 'string' ? sentence.text.trim() : '';
    const start = typeof sentence.start_time === 'number' ? sentence.start_time : 0;
    return text ? `[${formatTimestamp(start + offsetMs)}] ${text}` : '';
  }).filter(Boolean);
  if (timestamped.length) return timestamped.join('\n');
  return channels.map((channel) => typeof channel.text === 'string' ? channel.text.trim() : '').filter(Boolean).join('\n');
}

function createWavHeader(dataBytes: number) {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 4, 'ascii'); header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 4, 'ascii'); header.write('fmt ', 12, 4, 'ascii'); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(PCM_BYTES_PER_SECOND, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 4, 'ascii'); header.writeUInt32LE(dataBytes, 40);
  return header.toString('base64');
}

function getNativeAudioTools() {
  try {
    const loadedFs = require('react-native-fs') as { default?: ReactNativeFs } & Partial<ReactNativeFs>;
    const RNFS = (loadedFs.default ?? loadedFs) as ReactNativeFs;
    const audio = require('react-native-sherpa-onnx/audio') as typeof import('react-native-sherpa-onnx/audio');
    if (!RNFS.stat || !audio.convertAudioToWav16k) throw new Error('missing-native-module');
    return { RNFS, convertAudioToWav16k: audio.convertAudioToWav16k };
  } catch {
    throw new Error('当前运行环境不包含音频分段模块。请使用 OfferJing 完整版进行腾讯云长音频转写。');
  }
}

function splitSavedTranscript(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.split(/\n\n(?=【)/g).filter(Boolean) : [];
}

function normalizeNativePath(uri: string) { return decodeURIComponent(uri.replace(/^file:\/\//, '')); }
function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function formatTimestamp(valueMs: number) {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function requireCredential(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} 未填写。`);
}

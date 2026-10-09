import * as SecureStore from 'expo-secure-store';
import type { TencentAsrCredentials } from '../types';

const AI_API_KEY = 'offer-jing.ai-api-key.v1';
const OCR_API_KEY = 'offer-jing.ocr-api-key.v1';
const OCR_API_KEY_MIGRATED = 'offer-jing.ocr-api-key-migrated.v1';
const RESEARCH_API_KEY = 'offer-jing.research-api-key.v1';
const TENCENT_ASR_CREDENTIALS = 'offer-jing.tencent-asr-credentials.v1';

export function loadAiApiKey() {
  return SecureStore.getItemAsync(AI_API_KEY);
}

export async function saveAiApiKey(value: string) {
  const normalized = value.trim();
  await SecureStore.setItemAsync(AI_API_KEY, normalized);
  if ((await SecureStore.getItemAsync(AI_API_KEY)) !== normalized) {
    throw new Error('系统安全存储回读校验失败。');
  }
}

export function clearAiApiKey() {
  return SecureStore.deleteItemAsync(AI_API_KEY);
}

export async function loadOcrApiKey() {
  const saved = await SecureStore.getItemAsync(OCR_API_KEY);
  if (saved !== null) return saved;
  if (await SecureStore.getItemAsync(OCR_API_KEY_MIGRATED)) return null;
  const legacy = await loadAiApiKey();
  if (legacy) await SecureStore.setItemAsync(OCR_API_KEY, legacy);
  await SecureStore.setItemAsync(OCR_API_KEY_MIGRATED, '1');
  return legacy;
}

export async function saveOcrApiKey(value: string) {
  const normalized = value.trim();
  await SecureStore.setItemAsync(OCR_API_KEY, normalized);
  if ((await SecureStore.getItemAsync(OCR_API_KEY)) !== normalized) {
    throw new Error('系统安全存储回读校验失败。');
  }
}

export function clearOcrApiKey() {
  return Promise.all([
    SecureStore.deleteItemAsync(OCR_API_KEY),
    SecureStore.setItemAsync(OCR_API_KEY_MIGRATED, '1'),
  ]).then(() => undefined);
}

export function loadResearchApiKey() {
  return SecureStore.getItemAsync(RESEARCH_API_KEY);
}

export async function saveResearchApiKey(value: string) {
  const normalized = value.trim();
  await SecureStore.setItemAsync(RESEARCH_API_KEY, normalized);
  if ((await SecureStore.getItemAsync(RESEARCH_API_KEY)) !== normalized) {
    throw new Error('系统安全存储回读校验失败。');
  }
}

export function clearResearchApiKey() {
  return SecureStore.deleteItemAsync(RESEARCH_API_KEY);
}

export async function loadTencentAsrCredentials(): Promise<TencentAsrCredentials | null> {
  const raw = await SecureStore.getItemAsync(TENCENT_ASR_CREDENTIALS);
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Partial<TencentAsrCredentials>;
    return {
      appId: value.appId?.trim() ?? '',
      secretId: value.secretId?.trim() ?? '',
      secretKey: value.secretKey?.trim() ?? '',
    };
  } catch {
    return null;
  }
}

export async function saveTencentAsrCredentials(value: TencentAsrCredentials) {
  const normalized = {
    appId: value.appId.trim(),
    secretId: value.secretId.trim(),
    secretKey: value.secretKey.trim(),
  };
  await SecureStore.setItemAsync(
    TENCENT_ASR_CREDENTIALS,
    JSON.stringify(normalized),
  );
  const saved = await loadTencentAsrCredentials();
  if (!saved || saved.appId !== normalized.appId || saved.secretId !== normalized.secretId || saved.secretKey !== normalized.secretKey) {
    throw new Error('系统安全存储回读校验失败。');
  }
}

export function clearTencentAsrCredentials() {
  return SecureStore.deleteItemAsync(TENCENT_ASR_CREDENTIALS);
}

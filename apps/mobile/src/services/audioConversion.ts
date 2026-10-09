type AndroidAudioConverter = {
  convertToWav16k: (inputPath: string, outputPath: string) => Promise<string>;
  getDurationMillis: (inputPath: string) => Promise<number>;
  remuxAacToM4a: (inputPath: string, outputPath: string) => Promise<string>;
};

export async function convertAudioToWav16k(
  inputPath: string,
  outputPath: string,
  primaryConverter: (input: string, output: string) => Promise<void>,
) {
  try {
    await primaryConverter(inputPath, outputPath);
    return;
  } catch (primaryError) {
    const fallback = getAndroidAudioConverter();
    if (!fallback?.convertToWav16k) {
      throw new Error(formatAudioConversionError(primaryError));
    }
    try {
      await fallback.convertToWav16k(inputPath, outputPath);
    } catch (fallbackError) {
      throw new Error(formatAudioConversionError(fallbackError, primaryError));
    }
  }
}

function getAndroidAudioConverter() {
  try {
    const { NativeModules, Platform } = require('react-native') as typeof import('react-native');
    return Platform.OS === 'android'
      ? NativeModules.OfferJingAudioConverter as AndroidAudioConverter | undefined
      : undefined;
  } catch {
    return undefined;
  }
}

export async function getNativeAudioDurationMillis(audioUri: string) {
  const native = getAndroidAudioConverter();
  if (!native?.getDurationMillis) return 0;
  const value = await native.getDurationMillis(normalizeNativePath(audioUri));
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function remuxAacToM4a(audioUri: string, outputUri: string) {
  const native = getAndroidAudioConverter();
  if (!native?.remuxAacToM4a) throw new Error('当前安装包不支持 AAC 播放优化。');
  await native.remuxAacToM4a(normalizeNativePath(audioUri), normalizeNativePath(outputUri));
}

export function formatAudioConversionError(error: unknown, primaryError?: unknown) {
  const detail = getErrorMessage(error);
  const primaryDetail = getErrorMessage(primaryError);
  if (/failed to open input file|could not read audio|no audio stream|extractor/i.test(`${detail} ${primaryDetail}`)) {
    return '无法解码这段录音。文件可能使用了不兼容的 AAC 编码，或录音内容不完整；请先确认原文件能从头播放到结尾。';
  }
  return detail ? `音频转换失败：${detail}` : '音频转换失败，请确认原文件能正常播放。';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';
}

function normalizeNativePath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

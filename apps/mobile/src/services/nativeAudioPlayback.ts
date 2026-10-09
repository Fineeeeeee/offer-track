import { NativeModules, Platform } from 'react-native';

export type NativePlaybackStatus = {
  isLoaded: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
};

type NativeAudioPlaybackModule = {
  seekPlayback?: (inputPath: string, positionMillis: number, shouldPlay: boolean) => Promise<NativePlaybackStatus>;
  pausePlayback?: () => Promise<NativePlaybackStatus | null>;
  getPlaybackStatus?: () => Promise<NativePlaybackStatus | null>;
};

function getModule() {
  if (Platform.OS !== 'android') return null;
  return NativeModules.OfferJingAudioConverter as NativeAudioPlaybackModule | undefined;
}

export function supportsNativeAudioPlayback() {
  const native = getModule();
  return Boolean(native?.seekPlayback && native?.pausePlayback && native?.getPlaybackStatus);
}

export async function seekNativeAudioPlayback(uri: string, seconds: number, shouldPlay: boolean) {
  const native = getModule();
  if (!native?.seekPlayback) throw new Error('当前安装包不支持原生录音播放。');
  return native.seekPlayback(normalizeNativePath(uri), Math.max(0, seconds) * 1000, shouldPlay);
}

export async function pauseNativeAudioPlayback() {
  const native = getModule();
  return native?.pausePlayback ? native.pausePlayback() : null;
}

export async function getNativeAudioPlaybackStatus() {
  const native = getModule();
  return native?.getPlaybackStatus ? native.getPlaybackStatus() : null;
}

function normalizeNativePath(uri: string) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

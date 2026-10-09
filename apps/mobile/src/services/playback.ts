import type { AudioWorkState } from '../types';

export function getAudioStateText(state: AudioWorkState) {
  switch (state) {
    case 'reviewed':
      return '状态：已转写并生成基础复盘。';
    case 'transcribed':
      return '状态：已转写，等待确认或分析。';
    case 'saved':
      return '状态：仅本地保存，尚未处理。';
    default:
      return '状态：等待处理。';
  }
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}

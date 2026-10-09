import type { RecordingHealth } from '../types';

export type AudioDiagnostic = {
  level: 'healthy' | 'warning' | 'invalid';
  label: string;
  detail: string;
};

export function diagnoseAudioFile({
  sizeBytes,
  durationMillis,
  recordingHealth,
}: {
  sizeBytes: number;
  durationMillis: number;
  recordingHealth: RecordingHealth;
}): AudioDiagnostic {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1024) {
    return { level: 'invalid', label: '文件异常', detail: '没有读取到完整音频文件，请先重新确认录音。' };
  }
  const durationSeconds = Math.max(0, durationMillis / 1000);
  if (durationSeconds >= 30 && sizeBytes / durationSeconds < 2000) {
    return { level: 'warning', label: '体积偏小', detail: '音频体积明显低于当前时长，建议先试听中段和结尾。' };
  }
  if (recordingHealth === 'quiet') {
    return { level: 'warning', label: '声音偏弱', detail: '录音期间检测到较长低音量片段，转写前建议先试听。' };
  }
  return { level: 'healthy', label: '文件完整', detail: '音频已保存在本机，可以试听或开始转写。' };
}

export function buildAudioAuditPoints(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const points = [{ label: '开头', seconds: 0 }];
  if (durationSeconds >= 30) points.push({ label: '中段', seconds: durationSeconds / 2 });
  if (durationSeconds >= 15) points.push({ label: '结尾', seconds: Math.max(0, durationSeconds - 12) });
  return points.filter((point, index) => index === 0 || point.seconds - points[index - 1].seconds >= 5);
}

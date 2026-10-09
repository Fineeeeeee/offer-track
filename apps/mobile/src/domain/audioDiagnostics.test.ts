import { describe, expect, it } from 'vitest';
import { buildAudioAuditPoints, diagnoseAudioFile } from './audioDiagnostics';

describe('audio diagnostics', () => {
  it('rejects an unreadable audio file', () => {
    expect(diagnoseAudioFile({ sizeBytes: 100, durationMillis: 60_000, recordingHealth: 'healthy' }).level).toBe('invalid');
  });

  it('detects an implausibly small long recording', () => {
    expect(diagnoseAudioFile({ sizeBytes: 50_000, durationMillis: 60_000, recordingHealth: 'healthy' }).label).toBe('体积偏小');
  });

  it('keeps low-volume evidence visible after saving', () => {
    expect(diagnoseAudioFile({ sizeBytes: 500_000, durationMillis: 60_000, recordingHealth: 'quiet' }).label).toBe('声音偏弱');
  });
});

describe('audio audit points', () => {
  it('creates useful start, middle and end checks for a long interview', () => {
    expect(buildAudioAuditPoints(3600)).toEqual([
      { label: '开头', seconds: 0 },
      { label: '中段', seconds: 1800 },
      { label: '结尾', seconds: 3588 },
    ]);
  });
});

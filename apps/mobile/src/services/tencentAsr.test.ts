import { describe, expect, it, vi } from 'vitest';

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: '' } }));

import { formatTencentTranscript } from './tencentAsr';

describe('Tencent ASR transcript formatting', () => {
  it('keeps sentence timestamps and applies the chunk offset', () => {
    expect(formatTencentTranscript([{ sentence_list: [
      { start_time: 1_500, text: '请介绍一下项目' },
      { start_time: 5_000, text: '我负责系统设计' },
    ] }], 600_000)).toBe('[10:01] 请介绍一下项目\n[10:05] 我负责系统设计');
  });

  it('falls back to channel text when sentence details are unavailable', () => {
    expect(formatTencentTranscript([{ text: '完整转写内容' }])).toBe('完整转写内容');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildTranscriptSegments,
  clampPlaybackTarget,
  findActiveTimedItemIndex,
  removeTranscriptSegment,
} from './transcriptUtils';

describe('removeTranscriptSegment', () => {
  it('removes one speaker turn without deleting the other turns', () => {
    const source = '【00:00-00:20】面试官：介绍一下项目\n候选人：我负责 RAG 检索';

    expect(removeTranscriptSegment(source, { speaker: '面试官', text: '介绍一下项目' }))
      .toBe('【00:00-00:20】\n候选人：我负责 RAG 检索');
  });

  it('keeps the source unchanged when the segment no longer exists', () => {
    expect(removeTranscriptSegment('已有文本', { speaker: '我', text: '不存在' })).toBe('已有文本');
  });
});

describe('buildTranscriptSegments', () => {
  it('uses Tencent sentence timestamps as exact playback positions', () => {
    const segments = buildTranscriptSegments('【00:00-10:00】\n[00:15] 介绍一下项目\n[00:42] 我负责 RAG 检索', 600);
    expect(segments.map((item) => item.startSeconds)).toEqual([15, 42]);
    expect(segments.map((item) => item.timeLabel)).toEqual(['00:15', '00:42']);
  });

  it('marks positions inferred inside a local-model chunk as approximate', () => {
    const [first, second] = buildTranscriptSegments('【00:00-02:00】\n面试官：介绍项目\n我：项目内容', 120);
    expect(first.timeLabel).toBe('约 00:00');
    expect(second.timeLabel).toMatch(/^约 /u);
  });
});

describe('findActiveTimedItemIndex', () => {
  const items = [
    { startSeconds: 10, endSeconds: 20 },
    { startSeconds: 20, endSeconds: 35 },
    { startSeconds: 35, endSeconds: 50 },
  ];

  it('selects the item that owns the current playback boundary', () => {
    expect(findActiveTimedItemIndex(items, 10)).toBe(0);
    expect(findActiveTimedItemIndex(items, 20)).toBe(1);
    expect(findActiveTimedItemIndex(items, 49.5)).toBe(2);
  });

  it('returns no item before the first timestamp', () => {
    expect(findActiveTimedItemIndex(items, 9.9)).toBe(-1);
  });
});

describe('clampPlaybackTarget', () => {
  it('keeps a valid playback position unchanged', () => {
    expect(clampPlaybackTarget(42, 120)).toBe(42);
  });

  it('keeps the target usable before duration metadata is available', () => {
    expect(clampPlaybackTarget(42, 0)).toBe(42);
  });

  it('prevents seeking beyond the playable end of the audio', () => {
    expect(clampPlaybackTarget(125, 120)).toBe(119.75);
  });
});

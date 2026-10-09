import { describe, expect, it } from 'vitest';
import { bindAudioPlaybackSnapshot, selectAudioPlaybackSnapshot } from './audioPlaybackState';

const fallback = {
  isLoaded: true,
  playing: false,
  currentTime: 0,
  duration: 52 * 60 + 34,
  isBuffering: false,
};

describe('audio playback state isolation', () => {
  it('ignores a previous interview playback snapshot after switching audio', () => {
    const previous = bindAudioPlaybackSnapshot('file:///changyu.m4a', {
      ...fallback,
      currentTime: 20 * 60 + 46,
      duration: 94 * 60 + 36,
      playing: true,
    });

    expect(selectAudioPlaybackSnapshot('file:///siming.m4a', previous, fallback)).toEqual(fallback);
  });

  it('uses the native snapshot only for the same audio file', () => {
    const current = bindAudioPlaybackSnapshot('file:///siming.m4a', {
      ...fallback,
      currentTime: 240,
      playing: true,
    });

    expect(selectAudioPlaybackSnapshot('file:///siming.m4a', current, fallback)).toMatchObject({
      currentTime: 240,
      duration: 3154,
      playing: true,
    });
  });
});

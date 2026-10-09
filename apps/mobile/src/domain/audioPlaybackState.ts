export type AudioPlaybackSnapshot = {
  isLoaded: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
};

export type BoundAudioPlaybackSnapshot = AudioPlaybackSnapshot & {
  sourceUri: string;
};

export function bindAudioPlaybackSnapshot(
  sourceUri: string,
  snapshot: AudioPlaybackSnapshot,
): BoundAudioPlaybackSnapshot {
  return { ...snapshot, sourceUri };
}

export function selectAudioPlaybackSnapshot(
  sourceUri: string | null,
  snapshot: BoundAudioPlaybackSnapshot | null,
  fallback: AudioPlaybackSnapshot,
): AudioPlaybackSnapshot {
  if (!sourceUri || snapshot?.sourceUri !== sourceUri) return fallback;
  return snapshot;
}

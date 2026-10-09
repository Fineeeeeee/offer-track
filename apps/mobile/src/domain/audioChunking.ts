export type AudioChunk = {
  mainStart: number;
  mainEnd: number;
  segmentStart: number;
  segmentEnd: number;
};

export function createAudioChunkPlan({
  dataBytes,
  bytesPerSecond,
  chunkSeconds,
  overlapSeconds,
}: {
  dataBytes: number;
  bytesPerSecond: number;
  chunkSeconds: number;
  overlapSeconds: number;
}) {
  if (dataBytes <= 0 || bytesPerSecond <= 0 || chunkSeconds <= 0 || overlapSeconds < 0) return [];
  const chunkBytes = chunkSeconds * bytesPerSecond;
  const overlapBytes = overlapSeconds * bytesPerSecond;
  const total = Math.ceil(dataBytes / chunkBytes);
  return Array.from({ length: total }, (_, index): AudioChunk => {
    const mainStart = index * chunkBytes;
    const mainEnd = Math.min(dataBytes, (index + 1) * chunkBytes);
    return {
      mainStart,
      mainEnd,
      segmentStart: Math.max(0, mainStart - (index ? overlapBytes : 0)),
      segmentEnd: Math.min(dataBytes, mainEnd + (index < total - 1 ? overlapBytes : 0)),
    };
  });
}

export type LocalTranscriptSegment = {
  text: string;
  t0: number;
  t1: number;
};

export function addLocalTerminalPunctuation(value: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized || /[。！？!?；;…]$/u.test(normalized)) return normalized;
  if (/[，,:：]$/u.test(normalized)) return `${normalized.slice(0, -1)}。`;
  return `${normalized}。`;
}

export function formatLocalTranscriptSegments(segments: LocalTranscriptSegment[], chunkOffsetMs: number) {
  return segments
    .map((segment) => {
      const text = addLocalTerminalPunctuation(segment.text);
      if (!text) return '';
      const segmentMs = Math.max(0, segment.t0 * 10);
      const absoluteMs = chunkOffsetMs > 0 && segmentMs < chunkOffsetMs
        ? chunkOffsetMs + segmentMs
        : segmentMs;
      return `[${formatTimestamp(absoluteMs / 1000)}] ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatTimestamp(valueSeconds: number) {
  const totalSeconds = Math.max(0, Math.floor(valueSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

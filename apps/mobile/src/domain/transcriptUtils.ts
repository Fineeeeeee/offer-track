export function removeTranscriptSegment(source: string, segment: { speaker: string; text: string }) {
  const speakerLabels = segment.speaker === '转写片段'
    ? []
    : [`${segment.speaker}：${segment.text}`, `${segment.speaker}: ${segment.text}`, `${segment.speaker}:${segment.text}`];
  const target = [...speakerLabels, segment.text].find((candidate) => source.includes(candidate));
  if (!target) return source;
  return source
    .replace(target, '')
    .replace(/【[\d:]+-[\d:]+】\s*(?=【|$)/gu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export type TranscriptSegmentView = {
  speaker: string;
  text: string;
  startSeconds: number;
  timeLabel: string;
  canSeek: boolean;
};

export function findActiveTimedItemIndex(
  items: Array<{ startSeconds: number; endSeconds?: number }>,
  playbackSeconds: number,
) {
  if (!items.length || !Number.isFinite(playbackSeconds) || playbackSeconds < 0) return -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (playbackSeconds < item.startSeconds) continue;
    const nextStart = items[index + 1]?.startSeconds;
    const explicitEnd = item.endSeconds && item.endSeconds > item.startSeconds
      ? item.endSeconds
      : undefined;
    const endSeconds = nextStart ?? explicitEnd ?? Number.POSITIVE_INFINITY;
    return playbackSeconds < endSeconds || index === items.length - 1 ? index : -1;
  }
  return -1;
}

export function clampPlaybackTarget(seconds: number, durationSeconds: number) {
  const target = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return target;
  return Math.min(target, Math.max(0, durationSeconds - 0.25));
}

export function buildTranscriptSegments(value: string, durationSeconds: number): TranscriptSegmentView[] {
  const normalized = value.trim();
  if (!normalized) return [];
  const chunks = normalized.split(/\n\n(?=【)/g).filter(Boolean);
  const rawSegments: Array<{ speaker: string; text: string; start: number | null; approximate: boolean }> = [];

  chunks.forEach((chunk) => {
    const marker = chunk.match(/^【([\d:]+)-([\d:]+)】\s*/u);
    const body = marker ? chunk.slice(marker[0].length).trim() : chunk.trim();
    const chunkStart = marker ? parseTranscriptTimestamp(marker[1]) : null;
    const chunkEnd = marker ? parseTranscriptTimestamp(marker[2]) : null;
    const timestampedLines: Array<{ start: number; text: string; approximate: boolean }> = [];
    body.split(/\n/u).forEach((line) => {
      const normalizedLine = line.trim();
      if (!normalizedLine) return;
      const match = normalizedLine.match(/^\[([\d:]+)\]\s*(.+)$/u);
      if (match) {
        timestampedLines.push({ start: parseTranscriptTimestamp(match[1]), text: match[2].trim(), approximate: false });
      } else if (timestampedLines.length) {
        timestampedLines[timestampedLines.length - 1].text += `\n${normalizedLine}`;
      }
    });

    if (timestampedLines.length) {
      timestampedLines.forEach((item) => {
        const speakerMatch = item.text.match(/^(面试官|候选人|应聘者|我)\s*[：:]\s*/u);
        rawSegments.push({
          speaker: normalizeSpeaker(speakerMatch?.[1]),
          text: speakerMatch ? item.text.slice(speakerMatch[0].length).trim() : item.text,
          start: item.start,
          approximate: item.approximate,
        });
      });
      return;
    }

    const turns = body
      .replace(/(?=(?:面试官|候选人|应聘者|我)\s*[：:])/gu, '\n')
      .split(/\n{2,}|\n/u)
      .map((item) => item.trim())
      .filter(Boolean);
    const pieces = turns.length ? turns : [body];
    const totalCharacters = Math.max(1, pieces.reduce((sum, item) => sum + item.length, 0));
    let consumed = 0;
    pieces.forEach((piece) => {
      const speakerMatch = piece.match(/^(面试官|候选人|应聘者|我)\s*[：:]\s*/u);
      const start = chunkStart !== null && chunkEnd !== null
        ? chunkStart + (chunkEnd - chunkStart) * (consumed / totalCharacters)
        : null;
      rawSegments.push({
        speaker: normalizeSpeaker(speakerMatch?.[1]),
        text: speakerMatch ? piece.slice(speakerMatch[0].length).trim() : piece,
        start,
        approximate: pieces.length > 1,
      });
      consumed += piece.length;
    });
  });

  const totalCharacters = Math.max(1, rawSegments.reduce((sum, item) => sum + item.text.length, 0));
  let consumedCharacters = 0;
  return rawSegments.map((segment, index) => {
    const estimatedStart = durationSeconds > 0 ? (consumedCharacters / totalCharacters) * durationSeconds : 0;
    const startSeconds = segment.start ?? estimatedStart;
    const canSeek = segment.start !== null || durationSeconds > 0;
    const approximate = segment.start === null || segment.approximate;
    consumedCharacters += segment.text.length;
    return {
      speaker: segment.speaker,
      text: segment.text,
      startSeconds,
      canSeek,
      timeLabel: canSeek ? `${approximate ? '约 ' : ''}${formatTimestamp(startSeconds)}` : `片段 ${index + 1}`,
    };
  });
}

export function parseTranscriptTimestamp(value: string) {
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function normalizeSpeaker(value?: string) {
  if (value === '候选人' || value === '应聘者') return '我';
  return value || '转写片段';
}

function formatTimestamp(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

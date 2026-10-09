import type { TranscriptEvidenceBlock } from '../types';
import { buildTranscriptSegments } from './transcriptUtils';

// Short evidence blocks keep model grouping independent from audio navigation.
// Even transcripts without sentence timestamps can then seek near the spoken text.
const MAX_BLOCK_CHARACTERS = 100;

export function buildTranscriptEvidenceBlocks(transcript: string, durationSeconds: number): TranscriptEvidenceBlock[] {
  const parents = buildTranscriptSegments(transcript, durationSeconds);
  const blocks: TranscriptEvidenceBlock[] = [];
  parents.forEach((parent, parentSegmentIndex) => {
    const pieces = splitEvidenceText(parent.text);
    const nextParentStart = parents[parentSegmentIndex + 1]?.startSeconds ?? durationSeconds;
    const availableDuration = Math.max(0, nextParentStart - parent.startSeconds);
    const totalCharacters = Math.max(1, pieces.reduce((sum, piece) => sum + piece.length, 0));
    let consumedCharacters = 0;
    pieces.forEach((text, pieceIndex) => {
      const startSeconds = parent.startSeconds + availableDuration * (consumedCharacters / totalCharacters);
      consumedCharacters += text.length;
      const endSeconds = parent.startSeconds + availableDuration * (consumedCharacters / totalCharacters);
      blocks.push({
        id: `transcript-block-${parentSegmentIndex}-${pieceIndex}`,
        parentId: 'transcript-root',
        parentSegmentIndex,
        speaker: parent.speaker,
        text,
        startSeconds,
        endSeconds: Math.max(startSeconds, endSeconds),
        approximateTime: parent.timeLabel.startsWith('约 '),
      });
    });
  });
  return blocks;
}

function splitEvidenceText(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[。！？!?；;])|\n+/u).map((item) => item.trim()).filter(Boolean);
  const pieces: string[] = [];
  sentences.forEach((sentence) => {
    let remaining = sentence;
    while (remaining.length > MAX_BLOCK_CHARACTERS) {
      const window = remaining.slice(0, MAX_BLOCK_CHARACTERS + 1);
      const minimumBoundary = Math.floor(MAX_BLOCK_CHARACTERS * 0.55);
      const boundary = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf(' '));
      const cut = boundary >= minimumBoundary ? boundary + 1 : MAX_BLOCK_CHARACTERS;
      pieces.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) pieces.push(remaining);
  });
  return pieces;
}

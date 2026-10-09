import type { InterviewMode, TranscriptEvidenceBlock, TranscriptQaPair } from '../types';

export type TranscriptOrganizationQuality = {
  coverageRatio: number;
  latestTimestampRatio: number;
  distinctTimeBuckets: number;
  oversizedTurnCount: number;
  invalidRoleCount: number;
  passed: boolean;
  issues: string[];
};

const MAX_READABLE_TURN_CHARACTERS = 420;

export function evaluateTranscriptOrganizationQuality(
  pairs: TranscriptQaPair[],
  evidenceBlocks: TranscriptEvidenceBlock[],
  durationSeconds: number,
  interviewMode: InterviewMode,
): TranscriptOrganizationQuality {
  const expectedIds = new Set(evidenceBlocks.map((block) => block.id));
  const referencedIds = new Set<string>();
  const timestamps: number[] = [];
  let oversizedTurnCount = 0;
  let invalidRoleCount = 0;

  pairs.forEach((pair) => {
    pair.evidenceBlockIds?.forEach((id) => referencedIds.add(id));
    timestamps.push(pair.startSeconds);
    pair.turns?.forEach((turn) => {
      turn.evidenceBlockIds?.forEach((id) => referencedIds.add(id));
      timestamps.push(turn.startSeconds);
      if (turn.text.length > MAX_READABLE_TURN_CHARACTERS) oversizedTurnCount += 1;
      if (!['self', 'facilitator', 'participant', 'unknown'].includes(turn.role)) invalidRoleCount += 1;
    });
  });

  const coveredCount = [...referencedIds].filter((id) => expectedIds.has(id)).length;
  const coverageRatio = expectedIds.size ? coveredCount / expectedIds.size : 0;
  const latestTimestamp = timestamps.length ? Math.max(...timestamps) : 0;
  const latestTimestampRatio = durationSeconds > 0 ? latestTimestamp / durationSeconds : 0;
  const distinctTimeBuckets = new Set(timestamps.map((seconds) => Math.floor(seconds / 120))).size;
  const issues: string[] = [];

  if (coverageRatio < 1) issues.push(`原文覆盖率仅 ${Math.round(coverageRatio * 100)}%`);
  if (durationSeconds >= 600 && latestTimestampRatio < 0.75) issues.push('时间戳没有覆盖到录音后段');
  if (durationSeconds >= 1_800 && distinctTimeBuckets < 8) issues.push('时间戳分布过于集中');
  if (interviewMode === 'group' && oversizedTurnCount) issues.push(`仍有 ${oversizedTurnCount} 段发言过长`);
  if (invalidRoleCount) issues.push(`存在 ${invalidRoleCount} 个无效角色`);

  return {
    coverageRatio,
    latestTimestampRatio,
    distinctTimeBuckets,
    oversizedTurnCount,
    invalidRoleCount,
    passed: issues.length === 0,
    issues,
  };
}

export function assertTranscriptOrganizationQuality(
  pairs: TranscriptQaPair[],
  evidenceBlocks: TranscriptEvidenceBlock[],
  durationSeconds: number,
  interviewMode: InterviewMode,
) {
  const quality = evaluateTranscriptOrganizationQuality(pairs, evidenceBlocks, durationSeconds, interviewMode);
  if (!quality.passed) {
    throw new Error(`整理结果未通过完整性检查：${quality.issues.join('；')}。已完成部分仍保留，可继续整理。`);
  }
  return quality;
}

export function calculateOrderedTextSimilarity(source: string, organized: string) {
  const left = normalizeComparableText(source);
  const right = normalizeComparableText(organized);
  if (!left.length) return right.length ? 0 : 1;
  if (!right.length) return 0;

  const previous = new Uint16Array(right.length + 1);
  const current = new Uint16Array(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1] + 1
        : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    previous.set(current);
    current.fill(0);
  }
  return previous[right.length] / left.length;
}

function normalizeComparableText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/(?:^|\n)\s*(?:面试官|主持人|候选人|应聘者|讲师[^：:\n]*|老师|我|说话人\s*[a-z一二三四五六七八九十\d]*)\s*[：:]\s*/giu, '\n')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

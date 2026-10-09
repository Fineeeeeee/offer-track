import type { Interview, InterviewDraft } from '../types';

export type AttentionTranscriptionTask = {
  interview: Interview;
  draft: InterviewDraft;
};

export function getAttentionTranscriptionTasks(
  interviews: Interview[],
  drafts: Record<number, InterviewDraft>,
): AttentionTranscriptionTask[] {
  return interviews
    .map((interview) => ({ interview, draft: drafts[interview.id] }))
    .filter((item): item is AttentionTranscriptionTask =>
      Boolean(item.draft && (item.draft.transcriptionState === 'processing' || item.draft.transcriptionState === 'failed')),
    )
    .sort((left, right) => {
      if (left.draft.transcriptionState !== right.draft.transcriptionState) {
        return left.draft.transcriptionState === 'processing' ? -1 : 1;
      }
      return new Date(right.draft.transcriptionUpdatedAt || 0).getTime() - new Date(left.draft.transcriptionUpdatedAt || 0).getTime();
    });
}

export function formatTranscriptionTaskStatus(draft: InterviewDraft) {
  const progress = draft.transcriptionTotalParts > 0
    ? `${draft.transcriptionCompletedParts}/${draft.transcriptionTotalParts}`
    : '';
  if (draft.transcriptionState === 'processing') return progress ? `转写中 · ${progress}` : '正在准备转写';
  if (draft.transcriptionCompletedParts > 0) return `已保留 ${progress} · 点击继续`;
  return '转写失败 · 点击查看';
}

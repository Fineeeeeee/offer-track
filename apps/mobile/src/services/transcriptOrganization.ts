import { fetch } from 'expo/fetch';
import { buildTranscriptSegments } from '../domain/transcriptUtils';
import { buildTranscriptEvidenceBlocks } from '../domain/transcriptEvidence';
import { assertTranscriptOrganizationQuality, calculateOrderedTextSimilarity } from '../domain/transcriptOrganizationQuality';
import { finalizeGroupTranscriptOrganization, normalizeGroupTurnRole, normalizeTranscriptTopicTitle } from '../domain/transcriptOrganizationNormalization';
import type { AiServiceSettings, TranscriptEvidenceBlock, TranscriptQaPair, TranscriptQaTurn } from '../types';
import type { InterviewMode } from '../types';
import { resolveChatCompletionsUrl } from './apiEndpoint';

const MAX_CHUNK_CHARACTERS = 3200;
const MAX_SEGMENT_CHARACTERS = 700;
const MAX_GROUP_SEGMENT_CHARACTERS = 220;
const MAX_GROUP_TURN_CHARACTERS = 360;

type TranscriptSourceSegment = {
  index: number;
  sourceSegmentIndex: number;
  startSeconds: number;
  timeLabel: string;
  text: string;
  evidenceBlockId?: string;
};

export function buildTranscriptOrganizationChunks(
  transcript: string,
  durationSeconds: number,
  maxChunkCharacters = MAX_CHUNK_CHARACTERS,
  maxSegmentCharacters = MAX_SEGMENT_CHARACTERS,
  evidenceBlocks?: TranscriptEvidenceBlock[],
) {
  if (evidenceBlocks?.length) return chunkEvidenceBlocks(evidenceBlocks, maxChunkCharacters);
  const sourceSegments = buildTranscriptSegments(transcript, durationSeconds);
  const segments = sourceSegments.flatMap((segment, sourceSegmentIndex) => {
    const pieces = splitLongSegment(segment.text, maxSegmentCharacters);
    const nextStart = sourceSegments[sourceSegmentIndex + 1]?.startSeconds ?? durationSeconds;
    const availableDuration = Math.max(0, nextStart - segment.startSeconds);
    const totalCharacters = Math.max(1, pieces.reduce((sum, piece) => sum + piece.length, 0));
    let consumedCharacters = 0;
    return pieces.map((text) => {
      const startSeconds = segment.startSeconds + availableDuration * (consumedCharacters / totalCharacters);
      consumedCharacters += text.length;
      return {
        index: 0,
        sourceSegmentIndex,
        startSeconds,
        timeLabel: formatTimestamp(startSeconds),
        text,
      };
    });
  }).map((segment, index) => ({ ...segment, index }));
  const chunks: TranscriptSourceSegment[][] = [];
  let current: TranscriptSourceSegment[] = [];
  let currentLength = 0;
  segments.forEach((segment) => {
    const size = segment.text.length + 20;
    if (current.length && currentLength + size > maxChunkCharacters) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(segment);
    currentLength += size;
  });
  if (current.length) chunks.push(current);
  return chunks;
}

function chunkEvidenceBlocks(blocks: TranscriptEvidenceBlock[], maxChunkCharacters: number) {
  const chunks: TranscriptSourceSegment[][] = [];
  let current: TranscriptSourceSegment[] = [];
  let currentLength = 0;
  blocks.forEach((block, index) => {
    const segment: TranscriptSourceSegment = {
      index,
      sourceSegmentIndex: block.parentSegmentIndex,
      startSeconds: block.startSeconds,
      timeLabel: formatTimestamp(block.startSeconds),
      text: block.text,
      evidenceBlockId: block.id,
    };
    const size = segment.text.length + 20;
    if (current.length && currentLength + size > maxChunkCharacters) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(segment);
    currentLength += size;
  });
  if (current.length) chunks.push(current);
  return chunks;
}

function splitLongSegment(text: string, maxSegmentCharacters: number) {
  const normalized = text.trim();
  if (normalized.length <= maxSegmentCharacters) return normalized ? [normalized] : [];
  const pieces: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxSegmentCharacters) {
    const window = remaining.slice(0, maxSegmentCharacters + 1);
    const minimumBoundary = Math.floor(maxSegmentCharacters * 0.55);
    const candidates = [window.lastIndexOf('\n'), window.search(/[。！？!?；;](?![\s\S]*[。！？!?；;])/u), window.lastIndexOf('，'), window.lastIndexOf(' ')];
    const boundary = Math.max(...candidates.filter((position) => position >= minimumBoundary));
    const cut = boundary >= minimumBoundary ? boundary + 1 : maxSegmentCharacters;
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces.filter(Boolean);
}

export async function organizeInterviewTranscript({
  transcript,
  durationSeconds,
  settings,
  apiKey,
  existingPairs = [],
  completedChunks = 0,
  interviewMode = 'individual',
  selfSpeakerLabel = '',
  evidenceBlocks,
  onPartial,
}: {
  transcript: string;
  durationSeconds: number;
  settings: AiServiceSettings;
  apiKey: string;
  existingPairs?: TranscriptQaPair[];
  completedChunks?: number;
  interviewMode?: InterviewMode;
  selfSpeakerLabel?: string;
  evidenceBlocks?: TranscriptEvidenceBlock[];
  onPartial?: (pairs: TranscriptQaPair[], completed: number, total: number) => void;
}) {
  if (!settings.reviewUrl.trim() || !settings.reviewModel.trim() || !apiKey.trim()) {
    throw new Error('请先配置可用的 AI 复盘地址、模型和 Key。');
  }
  const chunks = buildTranscriptOrganizationChunks(
    transcript,
    durationSeconds,
    interviewMode === 'group' ? 1_800 : MAX_CHUNK_CHARACTERS,
    interviewMode === 'group' ? MAX_GROUP_SEGMENT_CHARACTERS : MAX_SEGMENT_CHARACTERS,
    evidenceBlocks?.length ? evidenceBlocks : buildTranscriptEvidenceBlocks(transcript, durationSeconds),
  );
  if (!chunks.length) throw new Error('没有可整理的转写内容。');

  const safeCompletedChunks = Math.min(Math.max(0, completedChunks), chunks.length);
  const pairs = [...existingPairs];
  onPartial?.(pairs, safeCompletedChunks, chunks.length);
  for (let index = safeCompletedChunks; index < chunks.length; index += 1) {
    const chunkPairs = await organizeChunk(
      chunks[index],
      settings,
      apiKey,
      index,
      chunks[index - 1]?.slice(-1) ?? [],
      chunks[index + 1]?.slice(0, 1) ?? [],
      interviewMode,
      selfSpeakerLabel,
    );
    pairs.push(...chunkPairs);
    onPartial?.(pairs, index + 1, chunks.length);
  }
  if (!pairs.length) {
    throw new Error('模型已响应，但没有识别出可展示的问答。可检查转写是否完整，或重新整理。');
  }
  const finalEvidenceBlocks = evidenceBlocks?.length ? evidenceBlocks : buildTranscriptEvidenceBlocks(transcript, durationSeconds);
  const finalizedPairs = interviewMode === 'group'
    ? finalizeGroupTranscriptOrganization(pairs, finalEvidenceBlocks)
    : pairs;
  onPartial?.(finalizedPairs, chunks.length, chunks.length);
  assertTranscriptOrganizationQuality(
    finalizedPairs,
    finalEvidenceBlocks,
    durationSeconds,
    interviewMode,
  );
  return finalizedPairs;
}

async function organizeChunk(
  segments: TranscriptSourceSegment[],
  settings: AiServiceSettings,
  apiKey: string,
  chunkIndex: number,
  previousContext: TranscriptSourceSegment[],
  nextContext: TranscriptSourceSegment[],
  interviewMode: InterviewMode,
  selfSpeakerLabel: string,
) {
  const source = segments.map((segment) => `[${segment.index}][${segment.timeLabel}] ${segment.text}`).join('\n');
  const context = [...previousContext, ...nextContext]
    .map((segment) => `[${segment.index}][${segment.timeLabel}] ${segment.text}`)
    .join('\n');
  const model = settings.reviewModel.trim();
  const requestBody: Record<string, unknown> = {
    model,
    temperature: 0.1,
    max_tokens: interviewMode === 'group' ? 8000 : 6000,
    stream: false,
    messages: [
      {
        role: 'system',
        content: interviewMode === 'group'
          ? '你是多人面试记录整理助手。场内角色只有面试官、候选人和身份待确认者。试讲、案例展示、编程演示仍是候选人的面试回答，不得把候选人命名为讲师、老师或主持人。必须完整处理本批次全部原文，按面试议题和发言顺序整理，不遗漏、不合并不同人的观点、不补写身份或事实。只返回完整、可解析的 JSON。'
          : '你是 1v1 面试记录整理助手。按核心议题组织完整原文，同一议题内的连续提问、追问和回答必须合并，避免一句一条。只根据原文断句和区分问答，不补写事实。只返回完整、可解析的 JSON。',
      },
      {
        role: 'user',
        content: interviewMode === 'group' ? [
          '将“本批次原文”按多人面试议题完整整理。一个议题可包含面试官与多位候选人的多次发言，必须保持原始发言顺序；不同人的内容不能揉成一段。',
          '返回格式：{"pairs":[{"question":"议题名称","answer":"该议题的客观一句话概括","startSegmentIndex":0,"endSegmentIndex":4,"confidence":"high|medium|low","format":"group-topic","turns":[{"speaker":"原文中的说话人标签；未知则写参与者","text":"该人的实际观点或互动，不虚构","role":"self|facilitator|participant|unknown","startSegmentIndex":0,"endSegmentIndex":1}]}]}',
          selfSpeakerLabel.trim()
            ? `用户已确认自己的说话人标签是“${selfSpeakerLabel.trim()}”。只有明确匹配该标签的发言 role 才能标为 self；其余人不得标为 self。`
            : '用户尚未确认自己的说话人标签。所有候选人发言都标为 participant 或 unknown，不得根据内容猜测谁是用户。',
          '面试官的提问、追问、评价或流程说明标为 facilitator，speaker 统一写“面试官”或“面试官 1/2”。候选人的回答、反问、试讲、案例展示或编程演示标为 participant，speaker 统一写“候选人 1/2”。不得因为某人在试讲中使用授课口吻就把他标成讲师或老师。无法确认阵营时 speaker 写“身份待确认”，role 标为 unknown。',
          '严格按说话轮次拆分：说话人切换时必须新建 turn，同一 turn 只能包含一个人的连续发言。输入已经切成短片段，优先让每个 turn 只引用一个片段；仅在确认是同一人连续说话时才允许合并相邻片段。若一个片段内混有多人发言，可以创建多个 turn 并重复引用该索引。不得为了少输出 turn 而合并提问、回答或不同候选人的发言。长篇试讲可拆成多个连续 turn，但角色仍是候选人。',
          '每条 turn 都必须引用本批次存在的 startSegmentIndex 和 endSegmentIndex。每个片段索引必须至少被一个 turn 覆盖；开场、闲聊、确认声音和结束语也单独保留在“其他对话”议题中。',
          'text 只做必要断句和标点整理，不改写观点，不删除犹豫、沉默、答不上来、打断或明显冲突等会影响多人面试判断的信息。',
          context ? `相邻上下文仅用于理解边界，禁止在结果中引用这些索引：\n${context}` : '',
          '本批次原文：',
          source,
        ].filter(Boolean).join('\n\n') : [
          '将“本批次原文”完整整理为 1 至 3 个核心议题，不得只摘取重点。同一主题下的澄清、追问和回答合并为一组；只有主题明显变化时才新建一组，禁止把每一句问话拆成一条。',
          '返回格式：{"pairs":[{"question":"","answer":"","startSegmentIndex":0,"endSegmentIndex":1,"confidence":"high|medium|low"}]}',
          'question 写成便于回看的议题标题，例如“工作经历与离职原因”“芯片销售情景演练”，不要照抄一连串零碎问句。answer 按真实对话顺序整理，可使用“面试官追问：”“我的回答：”分段保留关键互动。',
          'question 与 answer 要补充必要标点和分段，并去掉不影响语义的重复填充词；不能删掉犹豫、答不上来、停顿、纠正或被打断等会影响面试判断的信息。',
          'answer 只整理引用片段中的内容，不概括、不润色事实、不虚构说话人。索引必须引用下方存在的片段编号。',
          '本批次每个片段索引都必须被至少一组 startSegmentIndex 到 endSegmentIndex 覆盖。开场、确认声音、闲聊、结束语等非问答内容，归入 question="其他对话"，不能遗漏。',
          context ? `相邻上下文仅用于理解边界，禁止在结果中引用这些索引：\n${context}` : '',
          '本批次原文：',
          source,
        ].filter(Boolean).join('\n\n'),
      },
    ],
  };
  if (/qwen(?:3|\/qwen3)/iu.test(model)) requestBody.enable_thinking = false;
  const response = await fetch(resolveChatCompletionsUrl(settings.reviewUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(readApiError(text, response.status));
  const content = readAssistantContent(text);
  return parseTranscriptQaResponse(content, segments, chunkIndex, interviewMode);
}

export function parseTranscriptQaResponse(
  content: string,
  segments: TranscriptSourceSegment[],
  chunkIndex = 0,
  interviewMode: InterviewMode = 'individual',
): TranscriptQaPair[] {
  const payload = JSON.parse(extractJsonObject(content)) as { pairs?: unknown[] } | unknown[];
  const items = Array.isArray(payload) ? payload : payload.pairs;
  if (!Array.isArray(items)) return [];
  const byIndex = new Map(segments.map((segment) => [segment.index, segment]));
  const coveredIndexes = new Set<number>();
  let pairs = items.flatMap((item, itemIndex) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    const question = typeof value.question === 'string' ? value.question.trim() : '';
    const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
    const startIndex = Number(value.startSegmentIndex);
    const endIndex = Number(value.endSegmentIndex);
    const start = byIndex.get(startIndex);
    const end = byIndex.get(endIndex) ?? start;
    if (!question || !start || !end) return [];
    const confidence: TranscriptQaPair['confidence'] = value.confidence === 'high' || value.confidence === 'medium'
      ? value.confidence
      : 'low';
    const sourceSegmentIndexes = segments
      .filter((segment) => segment.index >= startIndex && segment.index <= endIndex)
      .map((segment) => segment.sourceSegmentIndex)
      .filter((sourceIndex, index, values) => values.indexOf(sourceIndex) === index);
    const pairEvidenceBlockIds = segments
      .filter((segment) => segment.index >= startIndex && segment.index <= endIndex)
      .map((segment) => segment.evidenceBlockId)
      .filter((id): id is string => Boolean(id));
    const turns = Array.isArray(value.turns) ? value.turns.flatMap((turn, turnIndex) => {
      if (!turn || typeof turn !== 'object') return [];
      const turnValue = turn as Record<string, unknown>;
      const turnText = typeof turnValue.text === 'string' ? turnValue.text.trim() : '';
      const turnStartIndex = Number(turnValue.startSegmentIndex);
      const turnEndIndex = Number(turnValue.endSegmentIndex);
      const turnStart = byIndex.get(turnStartIndex);
      const turnEnd = byIndex.get(turnEndIndex) ?? turnStart;
      if (!turnText || !turnStart || !turnEnd) return [];
      const parsedRole: TranscriptQaTurn['role'] = turnValue.role === 'self' || turnValue.role === 'facilitator' || turnValue.role === 'participant'
        ? turnValue.role
        : 'unknown';
      const role = normalizeGroupTurnRole(parsedRole, question, turnText);
      const turnSourceIndexes = segments
        .filter((segment) => segment.index >= turnStartIndex && segment.index <= turnEndIndex)
        .map((segment) => segment.sourceSegmentIndex)
        .filter((sourceIndex, index, values) => values.indexOf(sourceIndex) === index);
      const turnEvidenceBlockIds = segments
        .filter((segment) => segment.index >= turnStartIndex && segment.index <= turnEndIndex)
        .map((segment) => segment.evidenceBlockId)
        .filter((id): id is string => Boolean(id));
      const rawSpeaker = typeof turnValue.speaker === 'string' ? turnValue.speaker.trim() : '';
      const speaker = role === 'self'
        ? '我'
        : role === 'facilitator'
          ? '面试官'
          : role === 'participant'
            ? normalizeCandidateSpeaker(rawSpeaker)
            : '身份待确认';
      const coveredSegments = segments.filter((segment) => segment.index >= turnStartIndex && segment.index <= turnEndIndex);
      if (turnText.length > MAX_GROUP_TURN_CHARACTERS && coveredSegments.length > 1) {
        return coveredSegments.map((segment, pieceIndex) => ({
          id: `qa-${chunkIndex}-${itemIndex}-turn-${turnIndex}-${pieceIndex}`,
          speaker,
          text: segment.text,
          role,
          startSeconds: segment.startSeconds,
          sourceSegmentIndexes: [segment.sourceSegmentIndex],
          evidenceBlockIds: segment.evidenceBlockId ? [segment.evidenceBlockId] : undefined,
        }));
      }
      return [{
          id: `qa-${chunkIndex}-${itemIndex}-turn-${turnIndex}`,
          speaker,
          text: turnText,
          role,
          startSeconds: turnStart.startSeconds,
          sourceSegmentIndexes: turnSourceIndexes,
          evidenceBlockIds: turnEvidenceBlockIds,
        }];
    }) : undefined;
    const isGroupTopic = value.format === 'group-topic' && Boolean(turns?.length);
    if (isGroupTopic) {
      (value.turns as unknown[]).forEach((turn) => {
        if (!turn || typeof turn !== 'object') return;
        const turnValue = turn as Record<string, unknown>;
        const turnStartIndex = Number(turnValue.startSegmentIndex);
        const turnEndIndex = Number(turnValue.endSegmentIndex);
        segments
          .filter((segment) => segment.index >= turnStartIndex && segment.index <= turnEndIndex)
          .forEach((segment) => coveredIndexes.add(segment.index));
      });
    } else {
      segments
        .filter((segment) => segment.index >= startIndex && segment.index <= endIndex)
        .forEach((segment) => coveredIndexes.add(segment.index));
    }
    return [{
      id: `qa-${chunkIndex}-${itemIndex}-${startIndex}`,
      question: normalizeTranscriptTopicTitle(question, answer || turns?.map((turn) => turn.text).join('\n') || ''),
      answer: answer || undefined,
      startSeconds: start.startSeconds,
      endSeconds: end.startSeconds,
      confidence,
      sourceSegmentIndexes,
      evidenceBlockIds: pairEvidenceBlockIds,
      format: isGroupTopic ? 'group-topic' as const : 'qa' as const,
      turns: turns?.length ? turns : undefined,
    }];
  });
  const missingIndexes = segments
    .map((segment) => segment.index)
    .filter((index) => !coveredIndexes.has(index));
  if (missingIndexes.length) {
    const missingSegments = segments.filter((segment) => missingIndexes.includes(segment.index));
    const firstMissing = missingSegments[0];
    const lastMissing = missingSegments[missingSegments.length - 1];
    if (interviewMode === 'group') {
      pairs = [...pairs, {
        id: `qa-${chunkIndex}-group-source-recovery-${firstMissing.index}`,
        question: normalizeTranscriptTopicTitle('待核对对话', missingSegments.map((segment) => segment.text).join('\n')),
        answer: '模型未能确认这些发言的角色，原文已完整保留。',
        startSeconds: firstMissing.startSeconds,
        endSeconds: lastMissing.startSeconds,
        confidence: 'low',
        sourceSegmentIndexes: missingSegments
          .map((segment) => segment.sourceSegmentIndex)
          .filter((sourceIndex, index, values) => values.indexOf(sourceIndex) === index),
        evidenceBlockIds: missingSegments
          .map((segment) => segment.evidenceBlockId)
          .filter((id): id is string => Boolean(id)),
        format: 'group-topic',
        turns: missingSegments.map((segment, turnIndex) => ({
          id: `qa-${chunkIndex}-group-source-recovery-${firstMissing.index}-turn-${turnIndex}`,
          speaker: '身份待确认',
          text: segment.text,
          role: 'unknown',
          startSeconds: segment.startSeconds,
          sourceSegmentIndexes: [segment.sourceSegmentIndex],
          evidenceBlockIds: segment.evidenceBlockId ? [segment.evidenceBlockId] : undefined,
        })),
      }];
    } else {
      pairs = [...pairs, {
        id: `qa-${chunkIndex}-source-recovery-${firstMissing.index}`,
        question: normalizeTranscriptTopicTitle('未归类对话', missingSegments.map((segment) => segment.text).join('\n')),
        answer: missingSegments.map((segment) => segment.text).join('\n'),
        startSeconds: firstMissing.startSeconds,
        endSeconds: lastMissing.startSeconds,
        confidence: 'low',
        sourceSegmentIndexes: missingSegments
          .map((segment) => segment.sourceSegmentIndex)
          .filter((sourceIndex, index, values) => values.indexOf(sourceIndex) === index),
        evidenceBlockIds: missingSegments
          .map((segment) => segment.evidenceBlockId)
          .filter((id): id is string => Boolean(id)),
        format: 'qa',
        turns: undefined,
      }];
    }
  }
  const organizedText = pairs.flatMap((pair) => pair.format === 'group-topic'
    ? pair.turns?.map((turn) => turn.text) ?? []
    : [pair.question, pair.answer ?? '']).join('\n');
  const sourceText = segments.map((segment) => segment.text).join('\n');
  const similarity = calculateOrderedTextSimilarity(sourceText, organizedText);
  if (similarity < 0.82) {
    return mergeIndividualPairs(buildSourceGroundedPairs(pairs, segments), 2);
  }
  return interviewMode === 'individual' ? mergeIndividualPairs(pairs, 2) : pairs;
}

function buildSourceGroundedPairs(pairs: TranscriptQaPair[], segments: TranscriptSourceSegment[]) {
  const byEvidenceId = new Map(segments.map((segment) => [segment.evidenceBlockId, segment]));
  return pairs.map((pair) => {
    const referenced = (pair.evidenceBlockIds ?? [])
      .map((id) => byEvidenceId.get(id))
      .filter((segment): segment is TranscriptSourceSegment => Boolean(segment));
    const sourceSegments = referenced.length
      ? referenced
      : segments.filter((segment) => pair.sourceSegmentIndexes.includes(segment.sourceSegmentIndex));
    return {
      ...pair,
      answer: sourceSegments.map((segment) => segment.text).join('\n'),
      confidence: 'low' as const,
    };
  });
}

function mergeIndividualPairs(pairs: TranscriptQaPair[], maximumGroups: number) {
  if (pairs.length <= maximumGroups) return pairs;
  const groupSize = Math.ceil(pairs.length / maximumGroups);
  const merged: TranscriptQaPair[] = [];
  for (let index = 0; index < pairs.length; index += groupSize) {
    const group = pairs.slice(index, index + groupSize);
    const first = group[0];
    const last = group[group.length - 1];
    const evidenceBlockIds = group
      .flatMap((pair) => pair.evidenceBlockIds ?? [])
      .filter((id, itemIndex, values) => values.indexOf(id) === itemIndex);
    const sourceSegmentIndexes = group
      .flatMap((pair) => pair.sourceSegmentIndexes)
      .filter((sourceIndex, itemIndex, values) => values.indexOf(sourceIndex) === itemIndex);
    const answer = group.map((pair, pairIndex) => [
      pairIndex ? `追问：${pair.question}` : '',
      pair.answer ? `${pairIndex ? '回答：' : ''}${pair.answer}` : '未识别到明确回答。',
    ].filter(Boolean).join('\n')).join('\n\n');
    merged.push({
      ...first,
      id: `${first.id}-merged-${index}`,
      question: group.length > 1 ? `${trimTopicTitle(first.question)}及相关追问` : first.question,
      answer,
      endSeconds: last.endSeconds,
      evidenceBlockIds,
      sourceSegmentIndexes,
      confidence: group.some((pair) => pair.confidence === 'low') ? 'low' : first.confidence,
    });
  }
  return merged;
}

function trimTopicTitle(value: string) {
  const normalized = value.replace(/[？?。！!]$/u, '').trim();
  return normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized;
}

function normalizeCandidateSpeaker(rawSpeaker: string) {
  const numberedCandidate = rawSpeaker.match(/候选人\s*([一二三四五六七八九十\d]+)/u)?.[1];
  return numberedCandidate ? `候选人 ${numberedCandidate}` : '候选人';
}

function readAssistantContent(text: string) {
  const payload = JSON.parse(text) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as { finish_reason?: unknown; message?: { content?: unknown; reasoning_content?: unknown } } | undefined;
  if (first?.finish_reason === 'length') {
    throw new Error('模型输出达到长度上限，只返回了部分问答。本段未标记完成，可重新继续整理。');
  }
  const content = first?.message?.content ?? payload.output_text ?? payload.text;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const combined = content.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as { text?: unknown; content?: unknown };
      const candidate = value.text ?? value.content;
      return typeof candidate === 'string' ? [candidate] : [];
    }).join('\n').trim();
    if (combined) return combined;
  }
  const reasoningContent = first?.message?.reasoning_content;
  if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
    try {
      extractJsonObject(reasoningContent);
      return reasoningContent;
    } catch {
      const finishReason = typeof first?.finish_reason === 'string' ? `（${first.finish_reason}）` : '';
      throw new Error(`模型只返回了思考过程，没有生成最终问答${finishReason}。本次不会自动重复请求。`);
    }
  }
  const finishReason = typeof first?.finish_reason === 'string' ? `（${first.finish_reason}）` : '';
  throw new Error(`模型没有返回问答正文${finishReason}。本次不会自动重复请求。`);
}

function extractJsonObject(content: string) {
  const normalized = content
    .trim()
    .replace(/<think>[\s\S]*?<\/think>/giu, '')
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  const objectStart = normalized.indexOf('{');
  const arrayStart = normalized.indexOf('[');
  const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  const objectEnd = normalized.lastIndexOf('}');
  const arrayEnd = normalized.lastIndexOf(']');
  const end = Math.max(objectEnd, arrayEnd);
  if (start < 0 || end < start) throw new Error('AI 返回的问答格式不完整，请重新整理。');
  return normalized.slice(start, end + 1);
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

function readApiError(text: string, status: number) {
  try {
    const payload = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return payload.error?.message || payload.message || `AI 整理请求失败（${status}）`;
  } catch {
    return `AI 整理请求失败（${status}）`;
  }
}

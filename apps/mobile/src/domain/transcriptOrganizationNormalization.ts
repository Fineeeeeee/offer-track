import type { TranscriptEvidenceBlock, TranscriptQaPair, TranscriptQaTurn } from '../types';

export function normalizeTranscriptTopicTitle(question: string, content: string) {
  if (!/^(?:未归类对话|其他对话|待核对对话)$/u.test(question.trim())) return question;
  const text = content.toLocaleLowerCase();
  if (/(?:erp|财务系统)/iu.test(text) && /(?:ai\s*盒子|盒子|本地算力|智能体|agent)/iu.test(text)) {
    return 'AI 盒子与 ERP 集成场景';
  }
  if (/(?:薪资|工资|底薪|提成|奖金)/u.test(text)) return '薪资结构与岗位预期';
  if (/(?:客户|采购|销售)/u.test(text) && /(?:价格|报价|谈判|开发)/u.test(text)) return '客户开发与销售策略';
  if (/(?:加微信|联系方式|谢谢|再见)/u.test(text)) return '结束沟通与联系方式';
  return question === '未归类对话' ? '待核对对话' : question;
}

export function normalizeGroupTurnRole(
  role: TranscriptQaTurn['role'],
  topic: string,
  text: string,
): TranscriptQaTurn['role'] {
  if (role !== 'facilitator') return role;
  const teachingSignals = [
    /同学们/u,
    /今天(?:要|来)(?:讲|学习|演示)/u,
    /我们(?:先|来|可以|要)(?:看|学习|复习|练习)/u,
    /(?:函数|变量|输入|输出|编程).{0,12}(?:结构|语句|题目|内容)/u,
    /课前直播|进入学习/u,
  ].filter((pattern) => pattern.test(text)).length;
  if (teachingSignals >= 2) return 'participant';
  const scenarioAnswerSignals = [
    /理解您(?:现在)?的心情/u,
    /我们可以(?:先|从|给|通过)/u,
    /建议(?:您|孩子|先)/u,
    /孩子.{0,16}(?:兴趣|学习|课程|比赛)/u,
  ].filter((pattern) => pattern.test(text)).length;
  return /场景|模拟|家长沟通/u.test(topic) && scenarioAnswerSignals >= 2 ? 'participant' : role;
}

export function finalizeGroupTranscriptOrganization(
  pairs: TranscriptQaPair[],
  evidenceBlocks: TranscriptEvidenceBlock[],
): TranscriptQaPair[] {
  const evidenceById = new Map(evidenceBlocks.map((block) => [block.id, block]));
  const covered = new Set(pairs.flatMap((pair) => [
    ...(pair.evidenceBlockIds ?? []),
    ...(pair.turns?.flatMap((turn) => turn.evidenceBlockIds ?? []) ?? []),
  ]));
  const recovered = evidenceBlocks.filter((block) => !covered.has(block.id)).map((block) => ({
    id: `recovered-${block.id}`,
    question: '待核对对话',
    answer: '该段角色尚未确认，原文已按时间保留。',
    startSeconds: block.startSeconds,
    endSeconds: block.endSeconds,
    confidence: 'low' as const,
    sourceSegmentIndexes: [block.parentSegmentIndex],
    evidenceBlockIds: [block.id],
    format: 'group-topic' as const,
    turns: [{
      id: `recovered-${block.id}-turn`,
      speaker: '身份待确认',
      text: block.text,
      role: 'unknown' as const,
      startSeconds: block.startSeconds,
      sourceSegmentIndexes: [block.parentSegmentIndex],
      evidenceBlockIds: [block.id],
    }],
  }));

  const normalized = [...pairs, ...recovered]
    .map((pair) => normalizeGroupPair(pair, evidenceById))
    .sort((left, right) => left.startSeconds - right.startSeconds);
  return normalized.reduce<TranscriptQaPair[]>((result, pair) => {
    const previous = result[result.length - 1];
    if (previous && shouldMergeGroupTopics(previous, pair)) {
      result[result.length - 1] = mergeGroupTopics(previous, pair);
    } else {
      result.push(pair);
    }
    return result;
  }, []);
}

function normalizeGroupPair(pair: TranscriptQaPair, evidenceById: Map<string, TranscriptEvidenceBlock>) {
  const content = pair.turns?.map((turn) => turn.text).join('\n') || pair.answer || '';
  const question = normalizeGroupTopicTitle(pair.question, content);
  const turns = pair.turns?.map((turn) => {
    const role = normalizeGroupTurnRole(turn.role, question, turn.text);
    return { ...turn, role, speaker: role === 'facilitator' ? '面试官' : role === 'participant' ? normalizeCandidateLabel(turn.speaker) : turn.speaker };
  });
  const evidence = [...new Set([
    ...(pair.evidenceBlockIds ?? []),
    ...(turns?.flatMap((turn) => turn.evidenceBlockIds ?? []) ?? []),
  ])].map((id) => evidenceById.get(id)).filter((block): block is TranscriptEvidenceBlock => Boolean(block));
  return {
    ...pair,
    question,
    turns,
    startSeconds: evidence.length ? Math.min(...evidence.map((block) => block.startSeconds)) : pair.startSeconds,
    endSeconds: evidence.length ? Math.max(...evidence.map((block) => block.endSeconds)) : pair.endSeconds,
    evidenceBlockIds: evidence.map((block) => block.id),
  };
}

function normalizeGroupTopicTitle(question: string, content: string) {
  if (hasTeachingSignals(content)) return '编程试讲与教学表达';
  if (/自我介绍/u.test(question)) return '候选人自我介绍';
  if (/转行原因|面试动机|行业选择/u.test(question)) return '求职动机与行业选择';
  if (/培训(?:期|时长|内容|人数)|淘汰机制/u.test(question)) return '入职培训与考核机制';
  if (/工作时间|休息安排|日常工作时长|排课/u.test(question)) return '工作时间与排课安排';
  if (/待核对对话|其他对话/u.test(question)) return normalizeTranscriptTopicTitle(question, content);
  return question;
}

function hasTeachingSignals(content: string) {
  return [
    /同学们/u,
    /今天(?:要|来)(?:讲|学习|演示)/u,
    /(?:函数|变量|输入|输出|编程).{0,12}(?:结构|语句|题目|内容)/u,
    /程序的(?:主入口|结束)/u,
  ].filter((pattern) => pattern.test(content)).length >= 2;
}

function topicFamily(pair: TranscriptQaPair) {
  const title = pair.question;
  if (/试讲|教学表达/u.test(title)) return 'teaching-demo';
  if (/自我介绍/u.test(title)) return 'introduction';
  if (/求职动机|行业选择|转行原因/u.test(title)) return 'motivation';
  if (/工作时间|休息安排|排课/u.test(title)) return 'schedule';
  if (/培训|淘汰机制|考核机制/u.test(title)) return 'training';
  if (/待核对对话|其他对话/u.test(title)) return 'unclassified';
  return title.replace(/(?:续|补充|追问|回答)$/u, '').trim();
}

function shouldMergeGroupTopics(left: TranscriptQaPair, right: TranscriptQaPair) {
  const gap = right.startSeconds - left.endSeconds;
  if (gap > 90) return false;
  const leftFamily = topicFamily(left);
  const rightFamily = topicFamily(right);
  if (leftFamily === rightFamily) return true;
  return (leftFamily === 'unclassified' || rightFamily === 'unclassified') && gap <= 20;
}

function mergeGroupTopics(left: TranscriptQaPair, right: TranscriptQaPair): TranscriptQaPair {
  const turns = [...(left.turns ?? []), ...(right.turns ?? [])].sort((a, b) => a.startSeconds - b.startSeconds);
  return {
    ...left,
    id: `${left.id}-merged-${right.id}`,
    question: topicFamily(left) === 'unclassified' ? right.question : left.question,
    answer: [left.answer, right.answer].filter(Boolean).join(' '),
    startSeconds: Math.min(left.startSeconds, right.startSeconds),
    endSeconds: Math.max(left.endSeconds, right.endSeconds),
    confidence: left.confidence === 'low' || right.confidence === 'low' ? 'low' : left.confidence,
    sourceSegmentIndexes: [...new Set([...left.sourceSegmentIndexes, ...right.sourceSegmentIndexes])],
    evidenceBlockIds: [...new Set([...(left.evidenceBlockIds ?? []), ...(right.evidenceBlockIds ?? [])])],
    format: 'group-topic',
    turns,
  };
}

function normalizeCandidateLabel(speaker: string) {
  return /^候选人(?:\s*[一二三四五六七八九十\d]+)?$/u.test(speaker) ? speaker : '候选人';
}

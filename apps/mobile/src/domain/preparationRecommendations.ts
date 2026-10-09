import type { PreparationMaterial } from '../types';

export type PreparationRecommendation = Omit<PreparationMaterial, 'id'> & {
  reason: string;
  sourceKeywords: string[];
};

type RecommendationInput = {
  jobTitle: string;
  interviewTitle: string;
  round: string;
  tags: string[];
  jdSummary: string;
};

const topicRules: Array<{
  label: string;
  pattern: RegExp;
  prompts: string[];
}> = [
  {
    label: 'AI / 大模型',
    pattern: /(?:\b(?:ai|llm|rag|agent|prompt|embedding)\b|大模型|模型)/i,
    prompts: ['整体架构与关键取舍', '效果评估与失败案例', '延迟、成本和上线稳定性'],
  },
  {
    label: '交付 / 部署',
    pattern: /(fde|交付|部署|实施|客户现场|售前|解决方案)/i,
    prompts: ['从需求澄清到上线验收的完整过程', '现场故障定位与应急处理', '技术方案与客户沟通之间的取舍'],
  },
  {
    label: '后端 / 数据',
    pattern: /(后端|java|python|go|数据库|sql|并发|微服务|接口)/i,
    prompts: ['性能瓶颈的定位过程', '数据一致性与异常恢复', '高并发或复杂接口的设计取舍'],
  },
  {
    label: '前端 / 客户端',
    pattern: /(前端|react|vue|typescript|移动端|客户端|小程序)/i,
    prompts: ['复杂交互或状态管理方案', '性能与兼容性优化', '工程质量和线上问题定位'],
  },
  {
    label: '产品 / 运营',
    pattern: /(产品|运营|增长|用户|指标|商业化|策略)/i,
    prompts: ['目标用户与核心场景', '指标拆解和结果验证', '跨团队推动与优先级判断'],
  },
];

function cleanJdPoints(jdSummary: string) {
  return jdSummary
    .split(/\r?\n|[；。]/)
    .map((item) => item.replace(/^[\s\d.、•·\-]+/, '').trim())
    .filter((item) => item.length >= 8 && item.length <= 90)
    .filter((item) => !/^(来自|截图来源|识别结果|求职记录)/.test(item))
    .slice(0, 3);
}

function uniqueKeywords(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, 4);
}

export function buildPreparationRecommendations({
  jobTitle,
  interviewTitle,
  round,
  tags,
  jdSummary,
}: RecommendationInput): PreparationRecommendation[] {
  const role = jobTitle.trim() || interviewTitle.trim() || '目标岗位';
  const sourceText = [role, interviewTitle, round, tags.join(' '), jdSummary].join(' ');
  const jdPoints = cleanJdPoints(jdSummary);
  const matchedTopics = topicRules.filter((rule) => rule.pattern.test(sourceText));
  const topicKeywords = uniqueKeywords([...tags, ...matchedTopics.map((item) => item.label)]);
  const evidencePoints = jdPoints.length
    ? jdPoints.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : `1. ${role}最重要的业务目标\n2. 你与岗位要求直接对应的能力\n3. 可以量化的项目结果`;

  const recommendations: PreparationRecommendation[] = [
    {
      kind: 'role',
      title: `${role}岗位拆解`,
      body: `用 3 句话说明：\n1. 这个岗位要解决什么问题\n2. 你的经历为什么匹配\n3. 入职后最先推进什么\n\n结合 ${round || '本轮面试'}，优先准备可验证的具体例子。`,
      importance: 'high',
      reason: '根据关联岗位和面试轮次生成',
      sourceKeywords: uniqueKeywords([role, round]),
    },
    {
      kind: 'project',
      title: 'JD 要求与项目证据',
      body: `优先为这些要求各准备一个项目证据：\n${evidencePoints}\n\n每个案例按“背景 - 我的动作 - 结果数据 - 复盘”组织，避免只讲团队做了什么。`,
      importance: 'high',
      reason: jdPoints.length ? '从 JD 职责中提取' : '根据岗位信息补齐证据链',
      sourceKeywords: topicKeywords.length ? topicKeywords : uniqueKeywords([role]),
    },
  ];

  if (matchedTopics.length) {
    const technicalLines = matchedTopics
      .slice(0, 2)
      .flatMap((topic) => topic.prompts.map((prompt) => `- ${topic.label}：${prompt}`))
      .join('\n');
    recommendations.push({
      kind: 'technical',
      title: '岗位高概率追问',
      body: `${technicalLines}\n\n每项至少准备一个真实案例，并补充当时的限制、取舍和最终结果。`,
      importance: 'high',
      reason: '根据岗位关键词匹配常见追问方向',
      sourceKeywords: topicKeywords,
    });
  }

  recommendations.push({
    kind: 'questions',
    title: '针对岗位的反问',
    body: `1. ${role}入职 3 个月最重要的交付目标是什么？\n2. 当前团队在这个岗位上最希望补齐哪项能力？\n3. 这轮面试之后，您认为我还需要补充证明什么？`,
    importance: 'normal',
    reason: '根据岗位目标生成可获得有效信息的反问',
    sourceKeywords: uniqueKeywords([role, round]),
  });

  return recommendations;
}

export function excludeExistingRecommendations(
  recommendations: PreparationRecommendation[],
  existingMaterials: PreparationMaterial[],
) {
  return recommendations.filter(
    (recommendation) =>
      !existingMaterials.some(
        (material) =>
          material.kind === recommendation.kind &&
          material.title.trim().toLocaleLowerCase() === recommendation.title.trim().toLocaleLowerCase(),
      ),
  );
}

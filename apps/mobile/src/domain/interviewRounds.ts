const nextRoundLabels: Record<string, string> = {
  '一面': '二面',
  '二面': '三面',
  '三面': '终面',
  '初面': '复试',
  '复试': '终面',
  '技术面': '二面',
  'HR面': '终面',
};

export function inferNextInterviewRound(currentRound: string) {
  const normalized = currentRound.trim();
  if (nextRoundLabels[normalized]) return nextRoundLabels[normalized];
  const numeric = normalized.match(/(?:第\s*)?(\d+)\s*轮/u);
  if (numeric) return `第 ${Number(numeric[1]) + 1} 轮`;
  return '复试';
}

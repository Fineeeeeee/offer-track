export function parseScreenshotRecognition(content: string): { jobs: unknown[]; interviews: unknown[] } {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const payload = parseJson(normalized) ?? parseJson(extractJsonObject(normalized));
  if (!payload || typeof payload !== 'object') throw new Error('识别结果不是有效 JSON。');
  const record = payload as Record<string, unknown>;
  return {
    jobs: Array.isArray(record.jobs) ? record.jobs : [],
    interviews: Array.isArray(record.interviews) ? record.interviews : [],
  };
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function extractJsonObject(value: string) {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  return start >= 0 && end > start ? value.slice(start, end + 1) : '';
}

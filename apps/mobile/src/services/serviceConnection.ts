import { fetch } from 'expo/fetch';
import { resolveChatCompletionsUrl } from './apiEndpoint';
import { withRequestTimeout } from './requestTimeout';

const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAGNSURBVHhe7ZcBboQgEEU5HgfyON7Fq3iTqawfocqiu4hp8/9LyE8ra5zXYew6I0cCkLRIAJIWCUDSIgFIWiQASYsEIGmRACQtEoCkRQKQtEgAkhYJQNIiAchbmAZnzu3XYBOuH5iG1x4/zvjFkXn0uI+3yravuUcACqmuoaDhREDv4gPtAvLiK0UWr1cEPFF8oFHAZMOlh4z7nP1y8EbAU8UHmgTEB62d4Y3YCX60bXdBwJPFBxoEzDb6Tx60sH8vIEp6qPhAg4DY1pUpvyO+JbZjkAvYil9WaZZ0ol1A3tInxPY+CPCx7dO6dKxu4E90wLpwn3k0//qZaAbsJaZBeF3utzQISA96qV3jX/bkLbASZS2r8zxoEpCOwe79fuCz/wNW0md6zoNGAQv5OS5YSO1cuF4VsLDdu988aBcQyCW8W6UWOROwkL5g9ZkH9wgAxW+DtdfkBQG958GtAv4jEoCkRQKQtEgAkhYJQNIiAUhaJABJiwQgaZEAJC0SgKRFApC0SACSFglAkmL2A64AII9n/PynAAAAAElFTkSuQmCC';

export async function testChatServiceConnection({
  serviceUrl,
  model,
  apiKey,
  vision,
}: {
  serviceUrl: string;
  model: string;
  apiKey: string;
  vision: boolean;
}) {
  requireValue(serviceUrl, '服务地址');
  requireValue(model, '模型');
  requireValue(apiKey, 'API Key');

  const content = vision
    ? [
        { type: 'text', text: '读取图片中的两个字母，只回复字母。' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${TEST_IMAGE}` } },
      ]
    : '只回复 OK。';
  const response = await withRequestTimeout(45_000, (signal) => fetch(resolveChatCompletionsUrl(serviceUrl), {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model.trim(),
      temperature: 0,
      max_tokens: 256,
      stream: false,
      enable_thinking: false,
      messages: [{ role: 'user', content }],
    }),
  }));
  const raw = await response.text();
  const payload = parseJson(raw);
  if (!response.ok) {
    throw new Error(readPath(payload, ['error', 'message']) || readPath(payload, ['message']) || `请求失败（HTTP ${response.status}）`);
  }
  const answer = readPath(payload, ['choices', '0', 'message', 'content']) || readPath(payload, ['output_text']) || readPath(payload, ['text']);
  if (!answer) throw new Error('接口已响应，但没有返回可读取的内容。');
  if (vision && !/ok/i.test(answer.replace(/\s/g, ''))) {
    throw new Error(`模型已响应，但没有正确读取测试图片（返回：${answer.slice(0, 40)}）。`);
  }
  return answer;
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return { raw: value }; }
}

function readPath(payload: unknown, path: string[]) {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current.trim() : '';
}

function requireValue(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} 未填写。`);
}

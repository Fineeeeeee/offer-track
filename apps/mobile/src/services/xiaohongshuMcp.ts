import type { Job } from '../types';
import type { JobResearchPreset, JobResearchSource } from './jobResearch';
import { withRequestTimeout } from './requestTimeout';

const REQUIRED_TOOLS = ['check_login_status', 'search_feeds', 'get_feed_detail'] as const;

type JsonRpcMessage = {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

type McpSession = {
  endpoint: string;
  sessionId: string;
  nextId: number;
};

export type XiaohongshuMcpStatus = {
  connected: boolean;
  loggedIn: boolean;
  detail: string;
  tools: string[];
};

export type XiaohongshuResearchProgress = {
  stage: 'searching' | 'reading';
  completed: number;
  total: number;
  detail: string;
};

export async function testXiaohongshuMcpConnection(endpoint: string): Promise<XiaohongshuMcpStatus> {
  const session = await openSession(endpoint);
  const toolsResult = await request(session, 'tools/list', {});
  const tools = readToolNames(toolsResult);
  const missing = REQUIRED_TOOLS.filter((tool) => !tools.includes(tool));
  if (missing.length) {
    throw new Error(`MCP 已连接，但缺少工具：${missing.join('、')}。`);
  }
  const loginText = await callTool(session, 'check_login_status', {});
  const loggedIn = isLoggedIn(loginText);
  return {
    connected: true,
    loggedIn,
    detail: loggedIn ? 'MCP 已连接，小红书已登录' : 'MCP 已连接，小红书尚未登录',
    tools,
  };
}

export async function researchJobWithXiaohongshuMcp({
  endpoint,
  job,
  focus,
  preset = 'risk',
  maxNotes = 4,
  commentLimit = 10,
  pacingRangeMs = [1_400, 2_400],
  onProgress,
  signal,
}: {
  endpoint: string;
  job: Job;
  focus?: string;
  preset?: JobResearchPreset;
  maxNotes?: number;
  commentLimit?: number;
  pacingRangeMs?: [number, number];
  onProgress?: (progress: XiaohongshuResearchProgress) => void;
  signal?: AbortSignal;
}): Promise<JobResearchSource[]> {
  const session = await openSession(endpoint, signal);
  const loginText = await callTool(session, 'check_login_status', {}, signal);
  if (!isLoggedIn(loginText)) {
    throw new Error('小红书 MCP 尚未登录，请先在运行 MCP 的电脑上完成扫码登录。');
  }

  const query = buildXiaohongshuResearchQuery(job, preset, focus);
  const companyTerms = buildCompanyMatchTerms(job.company);
  onProgress?.({ stage: 'searching', completed: 0, total: 1, detail: `关键词：${query}` });
  const searchText = await callTool(session, 'search_feeds', { keyword: query }, signal);
  const feeds = shortlistRelevantFeeds(extractFeedReferences(searchText), companyTerms, maxNotes);
  if (!feeds.length) {
    throw new Error(`没有找到标题明确关联“${job.company}”的帖子。已使用关键词：${query}。可以补充公司简称后再试。`);
  }

  const sources: JobResearchSource[] = [];
  for (let index = 0; index < feeds.length && sources.length < maxNotes; index += 1) {
    const feed = feeds[index];
    onProgress?.({
      stage: 'reading',
      completed: index,
      total: feeds.length,
      detail: `核验帖子 ${index + 1}/${feeds.length}`,
    });
    const detailText = await callTool(session, 'get_feed_detail', {
      feed_id: feed.feedId,
      xsec_token: feed.xsecToken,
      load_all_comments: true,
      limit: Math.max(1, Math.min(commentLimit, 20)),
      click_more_replies: false,
      scroll_speed: 'normal',
    }, signal);
    if (!matchesCompany(`${feed.title}\n${detailText}`, companyTerms)) {
      onProgress?.({
        stage: 'reading',
        completed: index + 1,
        total: feeds.length,
        detail: `已跳过不相关结果 ${index + 1}/${feeds.length}`,
      });
      if (index < feeds.length - 1) await abortableWait(randomDelay(pacingRangeMs), signal);
      continue;
    }
    sources.push({
      title: extractFeedDetailTitle(detailText) || feed.title || `${job.company}相关帖子`,
      url: feed.url || `https://www.xiaohongshu.com/explore/${encodeURIComponent(feed.feedId)}?xsec_token=${encodeURIComponent(feed.xsecToken)}`,
      content: compactFeedDetail(detailText, commentLimit).slice(0, 16_000),
      site: '小红书',
      publishedAt: extractFeedPublishedAt(detailText),
    });
    onProgress?.({
      stage: 'reading',
      completed: index + 1,
      total: feeds.length,
      detail: `已确认 ${sources.length} 条相关来源`,
    });
    if (index < feeds.length - 1) await abortableWait(randomDelay(pacingRangeMs), signal);
  }
  if (!sources.length) {
    throw new Error(`搜索结果中没有正文明确提到“${job.company}”的帖子，因此没有自动采纳。已使用关键词：${query}。`);
  }
  return sources;
}

const INTENT_KEYWORDS: Record<JobResearchPreset, string[]> = {
  risk: ['工作体验', '避雷'],
  interview: ['面试', '面经'],
  role: ['岗位实情', '工作内容'],
  tech: ['技术栈', '研发团队'],
};

const FOCUS_KEYWORDS = [
  '工作体验', '面试', '面经', '加班', '薪资', '拖欠', '裁员', '试用期', '管理', '氛围',
  '驻场', '出差', '福利', '口碑', '晋升', '发展', '技术栈', '研发团队', '工作内容',
];

export function buildXiaohongshuResearchQuery(job: Job, preset: JobResearchPreset = 'risk', focus = '') {
  const company = buildCompanyKeyword(job.company);
  const focusKeywords = extractFocusKeywords(focus);
  return [company, ...(focusKeywords.length ? focusKeywords : INTENT_KEYWORDS[preset])].filter(Boolean).join(' ');
}

function extractFocusKeywords(value: string) {
  const normalized = value.trim();
  if (!normalized) return [];
  const known = FOCUS_KEYWORDS.filter((keyword) => normalized.includes(keyword));
  if (known.length) return known.slice(0, 3);
  const cleaned = normalized
    .replace(/请问|帮我|想查|想看|重点|是否|有没有|怎么样|如何|情况|一下|公司/gu, ' ')
    .split(/[\s,，。；;、？！?]+/u)
    .map((item) => item.trim().slice(0, 10))
    .filter((item) => item.length >= 2);
  return [...new Set(cleaned)].slice(0, 3);
}

function buildCompanyMatchTerms(company: string) {
  const withoutLocation = company.replace(/[（(][^）)]*[）)]/gu, '');
  const core = buildCompanyKeyword(company);
  return [...new Set([normalizeMatchText(company), normalizeMatchText(withoutLocation), normalizeMatchText(core)])]
    .filter((item) => item.length >= 2)
    .sort((left, right) => right.length - left.length);
}

function buildCompanyKeyword(company: string) {
  let keyword = company.replace(/[（(][^）)]*[）)]/gu, '').trim().replace(/\s+/gu, ' ');
  const suffix = /(?:有限责任公司|股份有限公司|集团有限公司|有限公司|集团公司|信息技术|网络科技|科技|集团|智能)$/u;
  let previous = '';
  while (keyword !== previous) {
    previous = keyword;
    keyword = keyword.replace(suffix, '').trim();
  }
  return keyword || company.trim();
}

function shortlistRelevantFeeds(
  feeds: ReturnType<typeof extractFeedReferences>,
  companyTerms: string[],
  maxNotes: number,
) {
  const scored = feeds.map((feed, index) => ({
    feed,
    index,
    score: companyTerms.reduce((score, term) => normalizeMatchText(feed.title).includes(term) ? Math.max(score, term.length) : score, 0),
  }));
  const titleMatches = scored.filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.index - right.index);
  const untitled = scored.filter((item) => !item.feed.title.trim());
  return [...titleMatches, ...untitled]
    .filter((item, index, values) => values.findIndex((other) => other.feed.feedId === item.feed.feedId) === index)
    .slice(0, Math.max(2, Math.min(8, maxNotes * 2)))
    .map((item) => item.feed);
}

function matchesCompany(value: string, companyTerms: string[]) {
  const normalized = normalizeMatchText(value);
  return companyTerms.some((term) => normalized.includes(term));
}

function normalizeMatchText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{Script=Han}a-z0-9]/gu, '');
}

async function openSession(value: string, signal?: AbortSignal): Promise<McpSession> {
  const endpoint = normalizeMcpEndpoint(value);
  const response = await rawRequest(endpoint, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'OfferJing', version: '1.3.1' },
    },
  }, '', 30_000, false, signal);
  if (response.message.error) throw rpcError(response.message.error);
  const session: McpSession = { endpoint, sessionId: response.sessionId, nextId: 2 };
  await rawRequest(endpoint, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, session.sessionId, 15_000, true, signal);
  return session;
}

async function request(session: McpSession, method: string, params: Record<string, unknown>, signal?: AbortSignal) {
  const id = session.nextId;
  session.nextId += 1;
  const response = await rawRequest(session.endpoint, { jsonrpc: '2.0', id, method, params }, session.sessionId, 90_000, false, signal);
  if (response.message.error) throw rpcError(response.message.error);
  return response.message.result;
}

async function callTool(session: McpSession, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const result = await request(session, 'tools/call', { name, arguments: args }, signal);
  if (isRecord(result) && result.isError) {
    throw new Error(readMcpContent(result) || `${name} 执行失败。`);
  }
  const text = readMcpContent(result);
  if (!text) throw new Error(`${name} 已响应，但没有返回可读取内容。`);
  if (/验证码|访问频繁|请求频繁|风控|captcha|too many requests|rate.?limit/iu.test(text)) {
    throw new Error('小红书要求验证或限制了当前访问，调研已暂停。请稍后在浏览器确认账号状态后再试。');
  }
  return text;
}

async function rawRequest(
  endpoint: string,
  payload: Record<string, unknown>,
  sessionId: string,
  timeoutMs: number,
  allowEmpty = false,
  externalSignal?: AbortSignal,
) {
  const response = await withRequestTimeout(timeoutMs, (signal) => fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify(payload),
  }), externalSignal);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`MCP 请求失败（HTTP ${response.status}）${raw ? `：${raw.slice(0, 160)}` : ''}`);
  }
  if (!raw.trim() && allowEmpty) {
    return { message: {} as JsonRpcMessage, sessionId: response.headers.get('mcp-session-id') ?? sessionId };
  }
  return {
    message: parseMcpMessage(raw, typeof payload.id === 'number' ? payload.id : undefined),
    sessionId: response.headers.get('mcp-session-id') ?? sessionId,
  };
}

export function normalizeMcpEndpoint(value: string) {
  const normalized = value.trim().replace(/\/+$/u, '');
  if (!normalized) throw new Error('请填写小红书 MCP 地址。');
  if (!/^https?:\/\//iu.test(normalized)) throw new Error('MCP 地址必须以 http:// 或 https:// 开头。');
  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error('MCP 地址格式无效。');
  }
}

function parseMcpMessage(raw: string, expectedId?: number): JsonRpcMessage {
  const candidates = raw
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== '[DONE]');
  if (!candidates.length) candidates.push(raw.trim());
  const messages = candidates.flatMap((candidate) => {
    try {
      return [JSON.parse(candidate) as JsonRpcMessage];
    } catch {
      return [];
    }
  });
  const matched = messages.find((message) => expectedId === undefined || message.id === expectedId) ?? messages[0];
  if (!matched) throw new Error(`MCP 返回了无法解析的内容：${raw.slice(0, 160)}`);
  return matched;
}

function readToolNames(result: unknown) {
  if (!isRecord(result) || !Array.isArray(result.tools)) return [];
  return result.tools.flatMap((tool) => isRecord(tool) && typeof tool.name === 'string' ? [tool.name] : []);
}

function readMcpContent(result: unknown) {
  if (!isRecord(result)) return '';
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return stringifyMcpValue(result.structuredContent);
  }
  const text = Array.isArray(result.content) ? result.content.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.text === 'string') return [item.text];
    if ('structuredContent' in item) return [JSON.stringify(item.structuredContent)];
    return [];
  }).join('\n').trim() : '';
  if (text) return text;

  const directResult = Object.fromEntries(Object.entries(result).filter(([key]) => !['content', 'isError'].includes(key)));
  return Object.keys(directResult).length ? stringifyMcpValue(directResult) : '';
}

function stringifyMcpValue(value: unknown) {
  if (typeof value === 'string') return value.trim();
  try { return JSON.stringify(value); } catch { return ''; }
}

export function compactFeedDetail(value: string, commentLimit: number) {
  const parsed = parseLooseJson(value);
  if (!isRecord(parsed)) return value;
  const data = isRecord(parsed.data) ? parsed.data : parsed;
  const note = isRecord(data.note) ? data.note : null;
  const comments = isRecord(data.comments) ? data.comments : null;
  const list = Array.isArray(data.comments) ? data.comments : comments && Array.isArray(comments.list) ? comments.list : [];
  if (!note && !comments && !Array.isArray(data.comments)) return value;

  const title = note ? readString(note, ['title']) : '';
  const desc = note ? readString(note, ['desc', 'description', 'content']) : '';
  const author = note ? readNestedString(note, 'user', ['nickname', 'nickName', 'name']) : '';
  const boundedComments = list.slice(0, Math.max(0, commentLimit)).flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [`- ${item.trim()}`];
    if (!isRecord(item)) return [];
    const content = readString(item, ['content', 'text']);
    if (!content) return [];
    const commentAuthor = readString(item, ['author']) || readNestedString(item, 'userInfo', ['nickname', 'nickName', 'name']);
    return [`- ${commentAuthor ? `${commentAuthor}：` : ''}${content}`];
  });
  return [
    title ? `标题：${title}` : '',
    author ? `作者：${author}` : '',
    desc ? `正文：\n${desc}` : '',
    boundedComments.length ? `一级评论（${boundedComments.length}）：\n${boundedComments.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function formatStoredMcpResearchContent(value: string, commentLimit = 10) {
  const content = value.replace(/^\[MCP自动调研\]\s*/u, '').trim();
  return compactFeedDetail(content, commentLimit);
}

export function resolveStoredMcpResearchTitle(fallback: string, value: string) {
  const content = value.replace(/^\[MCP自动调研\]\s*/u, '').trim();
  return extractFeedDetailTitle(content) || fallback;
}

function extractFeedDetailTitle(value: string) {
  const note = readFeedDetailNote(value);
  return note ? readString(note, ['title']) : '';
}

function extractFeedPublishedAt(value: string) {
  const note = readFeedDetailNote(value);
  const timestamp = note?.time ?? note?.createTime;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function readFeedDetailNote(value: string) {
  const parsed = parseLooseJson(value);
  if (!isRecord(parsed)) return null;
  const data = isRecord(parsed.data) ? parsed.data : parsed;
  return isRecord(data.note) ? data.note : null;
}

function readNestedString(record: Record<string, unknown>, key: string, keys: string[]) {
  return isRecord(record[key]) ? readString(record[key], keys) : '';
}

function isLoggedIn(text: string) {
  if (/未登录|尚未登录|not\s+logged|login\s+required|扫码登录/iu.test(text)) return false;
  return /已登录|logged\s+in|登录成功|success/iu.test(text);
}

export function extractFeedReferences(value: string) {
  const parsed = parseLooseJson(value);
  const references = new Map<string, { feedId: string; xsecToken: string; title: string; url: string }>();
  visit(parsed, (record) => {
    const feedId = readString(record, ['feed_id', 'feedId', 'note_id', 'noteId', 'id']);
    const xsecToken = readString(record, ['xsec_token', 'xsecToken']);
    if (!feedId || !xsecToken) return;
    references.set(`${feedId}:${xsecToken}`, {
      feedId,
      xsecToken,
      title: readFeedCardTitle(record),
      url: readString(record, ['url', 'link', 'note_url', 'noteUrl']),
    });
  });
  if (!references.size) {
    const blocks = value.split(/\n{2,}|(?=\{)/u);
    for (const block of blocks) {
      const feedId = matchField(block, ['feed_id', 'feedId', 'note_id', 'noteId', 'id']);
      const xsecToken = matchField(block, ['xsec_token', 'xsecToken']);
      if (!feedId || !xsecToken) continue;
      references.set(`${feedId}:${xsecToken}`, {
        feedId,
        xsecToken,
        title: matchField(block, ['title', 'display_title', 'displayTitle']),
        url: matchField(block, ['url', 'link']),
      });
    }
  }
  return [...references.values()];
}

function readFeedCardTitle(record: Record<string, unknown>) {
  const direct = readString(record, ['title', 'display_title', 'displayTitle', 'name']);
  if (direct) return direct;
  for (const key of ['noteCard', 'note_card']) {
    if (isRecord(record[key])) {
      const nested = readString(record[key], ['title', 'display_title', 'displayTitle', 'name']);
      if (nested) return nested;
    }
  }
  return '';
}

function parseLooseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { /* continue */ }
  const start = Math.min(...[value.indexOf('{'), value.indexOf('[')].filter((index) => index >= 0));
  const end = Math.max(value.lastIndexOf('}'), value.lastIndexOf(']'));
  if (Number.isFinite(start) && start >= 0 && end > start) {
    try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

function visit(value: unknown, callback: (record: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, callback));
    return;
  }
  if (!isRecord(value)) return;
  callback(value);
  Object.values(value).forEach((item) => visit(item, callback));
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function matchField(value: string, keys: string[]) {
  for (const key of keys) {
    const match = value.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']([^"'\\s,}]+)["']`, 'iu'));
    if (match?.[1]) return match[1];
  }
  return '';
}

function randomDelay([minimum, maximum]: [number, number]) {
  const lower = Math.max(0, Math.min(minimum, maximum));
  const upper = Math.max(lower, maximum);
  return Math.round(lower + Math.random() * (upper - lower));
}

function abortableWait(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function createAbortError() {
  const error = new Error('请求已取消。');
  error.name = 'AbortError';
  return error;
}

function rpcError(error: NonNullable<JsonRpcMessage['error']>) {
  return new Error(error.message || `MCP 请求失败${error.code ? `（${error.code}）` : ''}。`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

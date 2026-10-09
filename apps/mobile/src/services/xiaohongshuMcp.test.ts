import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../types';
import { buildXiaohongshuResearchQuery, compactFeedDetail, extractFeedReferences, formatStoredMcpResearchContent, normalizeMcpEndpoint, researchJobWithXiaohongshuMcp, resolveStoredMcpResearchTitle, testXiaohongshuMcpConnection } from './xiaohongshuMcp';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('xiaohongshu MCP helpers', () => {
  it('normalizes a Streamable HTTP endpoint', () => {
    expect(normalizeMcpEndpoint('http://192.168.1.8:18060/mcp/')).toBe('http://192.168.1.8:18060/mcp');
    expect(() => normalizeMcpEndpoint('192.168.1.8:18060/mcp')).toThrow('http://');
  });

  it('extracts feed ids and tokens from nested search results', () => {
    const result = extractFeedReferences(JSON.stringify({
      feeds: [{ id: 'feed-1', xsec_token: 'token-1', note_card: { display_title: '面试体验' } }],
    }));
    expect(result).toEqual([{ feedId: 'feed-1', xsecToken: 'token-1', title: '面试体验', url: '' }]);
  });

  it('builds a short keyword query without the full job title or city', () => {
    const job: Job = { id: 1, company: '瞬康科技有限公司', title: 'FDE 前线工程师/前置部署工程师', status: 'interviewing', platform: 'Boss', city: '广州天河', salary: '', tags: [], resume: '' };
    expect(buildXiaohongshuResearchQuery(job, 'risk')).toBe('瞬康 工作体验 避雷');
    expect(buildXiaohongshuResearchQuery(job, 'role', '想查是否长期驻场以及加班情况')).toBe('瞬康 加班 驻场');
    expect(buildXiaohongshuResearchQuery({ ...job, company: '熊猫优福科技（四川）集团有限公司' }, 'interview')).toBe('熊猫优福 面试 面经');
  });

  it('extracts feed references from text output', () => {
    const result = extractFeedReferences('feed_id: "feed-2"\nxsec_token: "token-2"\ntitle: "避雷记录"');
    expect(result[0]).toMatchObject({ feedId: 'feed-2', xsecToken: 'token-2' });
  });

  it('keeps only bounded first-level comments from a structured detail result', () => {
    const compact = compactFeedDetail(JSON.stringify({
      data: {
        note: { title: 'Interview notes', desc: 'Useful body', user: { nickname: 'author' } },
        comments: { list: [
          { content: 'first', userInfo: { nickname: 'reader' }, subComments: [{ content: 'nested' }] },
          { content: 'second' },
        ] },
      },
    }), 1);
    expect(compact).toContain('标题：Interview notes');
    expect(compact).toContain('正文：\nUseful body');
    expect(compact).toContain('一级评论（1）：\n- reader：first');
    expect(compact).not.toContain('nested');
  });

  it('formats research JSON saved by the previous app version', () => {
    const stored = `[MCP自动调研]\n${JSON.stringify({
      note: { title: '旧版标题', desc: '旧版正文', author: '作者' },
      comments: [{ content: '一级评论', author: '读者' }],
    })}`;
    expect(resolveStoredMcpResearchTitle('相关帖子 1', stored)).toBe('旧版标题');
    expect(formatStoredMcpResearchContent(stored)).toContain('正文：\n旧版正文');
    expect(formatStoredMcpResearchContent(stored)).toContain('- 读者：一级评论');
    expect(formatStoredMcpResearchContent(stored)).not.toContain('{"note"');
  });

  it('checks required tools and login through Streamable HTTP', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 1, result: { protocolVersion: '2025-03-26' } }, { 'mcp-session-id': 'session-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(response({ id: 2, result: { tools: [
        { name: 'check_login_status' }, { name: 'search_feeds' }, { name: 'get_feed_detail' },
      ] } }))
      .mockResolvedValueOnce(response({ id: 3, result: { content: [{ type: 'text', text: '已登录' }] } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testXiaohongshuMcpConnection('http://192.168.1.8:18060/mcp')).resolves.toMatchObject({
      connected: true,
      loggedIn: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('searches then reads a bounded number of comments', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 1, result: {} }, { 'mcp-session-id': 'session-2' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(response({ id: 2, result: { content: [{ type: 'text', text: '已登录' }] } }))
      .mockResolvedValueOnce(response({ id: 3, result: { content: [{ type: 'text', text: JSON.stringify({ feeds: [{ id: 'f1', xsec_token: 't1', title: '测试公司评价' }] }) }] } }))
      .mockResolvedValueOnce(response({ id: 4, result: { content: [{ type: 'text', text: '测试公司帖子正文与十条评论' }] } }));
    vi.stubGlobal('fetch', fetchMock);

    const sources = await researchJobWithXiaohongshuMcp({
      endpoint: 'http://192.168.1.8:18060/mcp',
      job: { id: 1, company: '测试公司', title: '工程师', status: 'interviewing', platform: 'Boss', city: '广州', salary: '', tags: [], resume: '' },
      maxNotes: 1,
      commentLimit: 10,
      pacingRangeMs: [0, 0],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].content).toContain('十条评论');
    const detailRequest = JSON.parse(String(fetchMock.mock.calls[4][1]?.body));
    expect(detailRequest.params.arguments).toMatchObject({ limit: 10, click_more_replies: false });
  });

  it('accepts top-level structuredContent returned by the current server', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 1, result: {} }, { 'mcp-session-id': 'session-3' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(response({ id: 2, result: { content: [{ type: 'text', text: '已登录' }] } }))
      .mockResolvedValueOnce(response({ id: 3, result: { structuredContent: { feeds: [
        { id: 'f2', xsecToken: 't2', noteCard: { displayTitle: 'Test interview result' } },
      ] } } }))
      .mockResolvedValueOnce(response({ id: 4, result: { structuredContent: { data: {
        note: { title: 'Test interview result', desc: 'Test company body' },
        comments: { list: [{ content: 'top-level', subComments: [{ content: 'nested' }] }] },
      } } } }));
    vi.stubGlobal('fetch', fetchMock);

    const sources = await researchJobWithXiaohongshuMcp({
      endpoint: 'http://192.168.1.8:18060/mcp',
      job: { id: 2, company: 'Test', title: 'Engineer', status: 'interviewing', platform: 'Boss', city: 'Guangzhou', salary: '', tags: [], resume: '' },
      maxNotes: 1,
      commentLimit: 10,
      pacingRangeMs: [0, 0],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].content).toContain('top-level');
    expect(sources[0].content).not.toContain('nested');
  });

  it('does not fetch details for clearly unrelated titled results', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ id: 1, result: {} }, { 'mcp-session-id': 'session-4' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(response({ id: 2, result: { content: [{ type: 'text', text: '已登录' }] } }))
      .mockResolvedValueOnce(response({ id: 3, result: { structuredContent: { feeds: [
        { id: 'f3', xsecToken: 't3', noteCard: { displayTitle: '通用面试技巧' } },
      ] } } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(researchJobWithXiaohongshuMcp({
      endpoint: 'http://192.168.1.8:18060/mcp',
      job: { id: 3, company: '瞬康科技', title: '工程师', status: 'interviewing', platform: 'Boss', city: '广州', salary: '', tags: [], resume: '' },
      pacingRangeMs: [0, 0],
    })).rejects.toThrow('没有找到标题明确关联');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

function response(payload: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
}

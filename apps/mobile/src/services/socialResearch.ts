import type { Job, JobResearchItem } from '../types';

export type SocialResearchPlatform = JobResearchItem['source'];

export const socialResearchPlatforms: Array<{
  value: Exclude<SocialResearchPlatform, 'web'>;
  label: string;
}> = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'nowcoder', label: '牛客' },
  { value: 'zhihu', label: '知乎' },
  { value: 'bilibili', label: 'B站' },
];

export function buildSocialResearchQuery(job: Job, focus = '') {
  return [job.company, job.title, focus.trim() || '评价 面经 避雷'].filter(Boolean).join(' ');
}

export function buildSocialResearchUrl(platform: Exclude<SocialResearchPlatform, 'web'>, query: string) {
  const encoded = encodeURIComponent(query.trim());
  const urls = {
    xiaohongshu: `https://www.xiaohongshu.com/search_result?keyword=${encoded}`,
    nowcoder: `https://www.nowcoder.com/search/all?query=${encoded}`,
    zhihu: `https://www.zhihu.com/search?type=content&q=${encoded}`,
    bilibili: `https://search.bilibili.com/all?keyword=${encoded}`,
  };
  return urls[platform];
}

export function detectResearchSource(url: string): SocialResearchPlatform {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('xiaohongshu.com')) return 'xiaohongshu';
    if (host.includes('nowcoder.com')) return 'nowcoder';
    if (host.includes('zhihu.com')) return 'zhihu';
    if (host.includes('bilibili.com')) return 'bilibili';
  } catch {
    return 'web';
  }
  return 'web';
}

export function createResearchItem({
  url,
  title,
  note,
  now = new Date(),
}: {
  url: string;
  title: string;
  note: string;
  now?: Date;
}): JobResearchItem {
  const normalizedUrl = normalizeResearchUrl(url);
  return {
    id: `research-${now.getTime()}`,
    source: detectResearchSource(normalizedUrl),
    title: title.trim() || sourceLabel(detectResearchSource(normalizedUrl)),
    url: normalizedUrl,
    note: note.trim(),
    createdAt: now.toISOString(),
  };
}

export function normalizeResearchUrl(value: string) {
  const url = value.trim();
  if (!/^https?:\/\//iu.test(url)) throw new Error('请粘贴以 http:// 或 https:// 开头的链接。');
  try {
    return new URL(url).toString();
  } catch {
    throw new Error('链接格式无效，请重新粘贴。');
  }
}

export function sourceLabel(source: SocialResearchPlatform) {
  return ({
    xiaohongshu: '小红书',
    nowcoder: '牛客',
    zhihu: '知乎',
    bilibili: 'B站',
    web: '网页资料',
  } satisfies Record<SocialResearchPlatform, string>)[source];
}

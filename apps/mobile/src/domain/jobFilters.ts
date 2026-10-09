import type { ApplicationStatus, Job } from '../types';

export type JobStatusFilter = 'all' | 'saved' | 'following' | 'interviewing' | 'result';

export const jobStatusFilters: Array<{ value: JobStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'saved', label: '待投' },
  { value: 'following', label: '跟进' },
  { value: 'interviewing', label: '面试' },
  { value: 'result', label: '结果' },
];

const statusGroups: Record<Exclude<JobStatusFilter, 'all'>, ApplicationStatus[]> = {
  saved: ['interested', 'preparing'],
  following: ['applied', 'responded'],
  interviewing: ['interviewing'],
  result: ['offered', 'ended'],
};

const cityNames = [
  '石家庄', '哈尔滨', '呼和浩特', '乌鲁木齐',
  '北京', '上海', '天津', '重庆', '广州', '深圳', '长沙', '杭州', '南京', '苏州',
  '武汉', '成都', '西安', '郑州', '济南', '青岛', '宁波', '厦门', '福州', '合肥',
  '南昌', '南宁', '昆明', '贵阳', '海口', '三亚', '东莞', '佛山', '珠海', '惠州',
  '中山', '无锡', '常州', '南通', '嘉兴', '绍兴', '温州', '泉州', '大连', '沈阳',
  '长春', '太原', '兰州', '西宁', '银川', '拉萨', '香港', '澳门',
].sort((left, right) => right.length - left.length);

export function matchesJobStatusFilter(status: ApplicationStatus, filter: JobStatusFilter) {
  return filter === 'all' || statusGroups[filter].includes(status);
}

export function normalizeCityLabel(value: string) {
  const normalized = value.trim().replace(/[·,，/]+/gu, ' ').replace(/\s+/gu, ' ');
  if (!normalized) return '未填写';
  if (/远程|居家|全国/iu.test(normalized)) return '远程';

  const knownCity = cityNames.find((city) => normalized.includes(city));
  if (knownCity) return knownCity;

  const cityMatch = normalized.match(/(?:^|省|自治区)([\u4e00-\u9fff]{2,8}?)(?:市)(?=\s|区|县|镇|街|$)/u);
  if (cityMatch?.[1]) return cityMatch[1];

  return normalized.split(' ')[0].replace(/市$/u, '') || '未填写';
}

export function normalizeJobCity(job: Job): Job {
  return { ...job, city: normalizeCityLabel(job.city) };
}

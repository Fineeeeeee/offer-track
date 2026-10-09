import type { Job } from '../types';

export function buildInterviewLinkedJob({
  id,
  company,
  title,
  resume,
}: {
  id: number;
  company: string;
  title: string;
  resume: string;
}): Job {
  return {
    id,
    company,
    title,
    platform: '手动添加',
    city: '待定',
    status: 'interviewing',
    salary: '未填写',
    tags: [],
    resume: resume || '未绑定',
  };
}

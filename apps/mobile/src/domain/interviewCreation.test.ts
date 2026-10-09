import { describe, expect, it } from 'vitest';
import { buildInterviewLinkedJob } from './interviewCreation';

describe('buildInterviewLinkedJob', () => {
  it('creates a visible interviewing job for a directly created interview', () => {
    expect(buildInterviewLinkedJob({
      id: 101,
      company: '示例科技',
      title: '解决方案工程师',
      resume: '默认简历',
    })).toEqual({
      id: 101,
      company: '示例科技',
      title: '解决方案工程师',
      platform: '手动添加',
      city: '待定',
      status: 'interviewing',
      salary: '未填写',
      tags: [],
      resume: '默认简历',
    });
  });
});

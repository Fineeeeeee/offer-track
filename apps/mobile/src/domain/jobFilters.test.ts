import { describe, expect, it } from 'vitest';
import { matchesJobStatusFilter, normalizeCityLabel } from './jobFilters';

describe('normalizeCityLabel', () => {
  it.each([
    ['广州 天河区 珠江新城', '广州'],
    ['广东省广州市天河区', '广州'],
    ['长沙 岳麓区 含浦', '长沙'],
    ['上海 普陀区 曹杨', '上海'],
    ['东莞 虎门镇 大宁', '东莞'],
    ['远程办公', '远程'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCityLabel(input)).toBe(expected);
  });
});

describe('matchesJobStatusFilter', () => {
  it('groups low-frequency statuses into four user-facing stages', () => {
    expect(matchesJobStatusFilter('preparing', 'saved')).toBe(true);
    expect(matchesJobStatusFilter('responded', 'following')).toBe(true);
    expect(matchesJobStatusFilter('interviewing', 'interviewing')).toBe(true);
    expect(matchesJobStatusFilter('offered', 'result')).toBe(true);
    expect(matchesJobStatusFilter('ended', 'result')).toBe(true);
    expect(matchesJobStatusFilter('applied', 'result')).toBe(false);
  });
});

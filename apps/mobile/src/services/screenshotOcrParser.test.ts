import { describe, expect, it } from 'vitest';
import { parseScreenshotRecognition } from './screenshotOcrParser';

describe('parseScreenshotRecognition', () => {
  it('keeps all jobs and interviews returned in a fenced response', () => {
    const result = parseScreenshotRecognition('```json\n{"jobs":[{"title":"A"},{"title":"B"}],"interviews":[{"round":"一面"}]}\n```');
    expect(result.jobs).toHaveLength(2);
    expect(result.interviews).toHaveLength(1);
  });

  it('extracts JSON from surrounding model text', () => {
    expect(parseScreenshotRecognition('结果如下：{"jobs":[],"interviews":[]} 完成')).toEqual({ jobs: [], interviews: [] });
  });
});

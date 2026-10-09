import { describe, expect, it } from 'vitest';
import { omitRecordKeys } from './recordUtils';

describe('omitRecordKeys', () => {
  it('removes every related numeric key without mutating input', () => {
    const input = { 1: 'keep', 2: 'delete', 3: 'delete' };
    expect(omitRecordKeys(input, [2, 3])).toEqual({ 1: 'keep' });
    expect(input).toEqual({ 1: 'keep', 2: 'delete', 3: 'delete' });
  });
});

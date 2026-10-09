import { beforeEach, describe, expect, it, vi } from 'vitest';

const getItem = vi.fn();
const setItem = vi.fn();
const removeItem = vi.fn();
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem, setItem, removeItem } }));

describe('long task recovery', () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
    removeItem.mockReset();
  });

  it('records and consumes an interrupted task marker', async () => {
    const task = { type: 'ocr' as const, startedAt: '2026-08-09T12:00:00.000Z', detail: '识别 3 张截图' };
    getItem.mockResolvedValue(JSON.stringify(task));
    const service = await import('./longTaskRecovery');
    await service.markLongTaskStarted(task);
    await expect(service.consumeInterruptedLongTask()).resolves.toEqual(task);
    expect(setItem).toHaveBeenCalledWith('offer-jing:long-task:v1', JSON.stringify(task));
    expect(removeItem).toHaveBeenCalledWith('offer-jing:long-task:v1');
  });
});

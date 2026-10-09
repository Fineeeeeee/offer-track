import AsyncStorage from '@react-native-async-storage/async-storage';

const LONG_TASK_KEY = 'offer-jing:long-task:v1';

export type RecoverableLongTask = {
  type: 'ocr' | 'research';
  startedAt: string;
  detail: string;
};

export function markLongTaskStarted(task: RecoverableLongTask) {
  return AsyncStorage.setItem(LONG_TASK_KEY, JSON.stringify(task));
}

export function clearLongTask() {
  return AsyncStorage.removeItem(LONG_TASK_KEY);
}

export async function consumeInterruptedLongTask(): Promise<RecoverableLongTask | null> {
  const raw = await AsyncStorage.getItem(LONG_TASK_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(LONG_TASK_KEY);
  try {
    const value = JSON.parse(raw) as Partial<RecoverableLongTask>;
    if ((value.type === 'ocr' || value.type === 'research') && value.startedAt && value.detail) {
      return value as RecoverableLongTask;
    }
  } catch {
    return null;
  }
  return null;
}

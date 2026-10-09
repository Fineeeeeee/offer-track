export async function withRequestTimeout<T>(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (externalSignal?.aborted) {
      const aborted = new Error('请求已取消。');
      aborted.name = 'AbortError';
      throw aborted;
    }
    if (controller.signal.aborted) {
      throw new Error(`请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未响应，请检查网络或更换模型。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

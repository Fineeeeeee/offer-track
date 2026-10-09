import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

describe('testChatServiceConnection', () => {
  beforeEach(() => fetchMock.mockReset());

  it('uses the completed endpoint and accepts a text response', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }) });
    const { testChatServiceConnection } = await import('./serviceConnection');
    await expect(testChatServiceConnection({ serviceUrl: 'https://api.example.com/v1', model: 'text-model', apiKey: 'secret', vision: false })).resolves.toBe('OK');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', expect.any(Object));
    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    expect(JSON.parse(request.body ?? '{}')).toMatchObject({
      max_tokens: 256,
      stream: false,
      enable_thinking: false,
    });
  });

  it('surfaces provider errors without exposing the key', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'Unauthorized' } }) });
    const { testChatServiceConnection } = await import('./serviceConnection');
    await expect(testChatServiceConnection({ serviceUrl: 'https://api.example.com/v1', model: 'vision-model', apiKey: 'secret', vision: true })).rejects.toThrow('Unauthorized');
  });
});

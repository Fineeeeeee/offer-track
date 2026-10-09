import { describe, expect, it } from 'vitest';
import { getServiceBaseUrl, resolveChatCompletionsUrl } from './apiEndpoint';

describe('apiEndpoint', () => {
  it('adds the OpenAI-compatible endpoint after v1', () => {
    expect(resolveChatCompletionsUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/chat/completions');
    expect(resolveChatCompletionsUrl('https://api.example.com')).toBe('https://api.example.com/v1/chat/completions');
  });

  it('keeps complete endpoints compatible and derives the editable base', () => {
    const endpoint = 'https://api.example.com/v1/chat/completions';
    expect(resolveChatCompletionsUrl(endpoint)).toBe(endpoint);
    expect(getServiceBaseUrl(endpoint)).toBe('https://api.example.com/v1');
  });
});

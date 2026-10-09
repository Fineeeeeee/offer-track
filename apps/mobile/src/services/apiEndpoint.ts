const CHAT_COMPLETIONS_SUFFIX = '/chat/completions';

export function resolveChatCompletionsUrl(serviceUrl: string) {
  const normalized = normalizeUrl(serviceUrl);
  if (!normalized) return '';
  if (normalized.endsWith(CHAT_COMPLETIONS_SUFFIX)) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}${CHAT_COMPLETIONS_SUFFIX}`;
  return `${normalized}/v1${CHAT_COMPLETIONS_SUFFIX}`;
}

export function getServiceBaseUrl(serviceUrl: string) {
  const normalized = normalizeUrl(serviceUrl);
  if (normalized.endsWith(`/v1${CHAT_COMPLETIONS_SUFFIX}`)) {
    return normalized.slice(0, -CHAT_COMPLETIONS_SUFFIX.length);
  }
  if (normalized.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return normalized.slice(0, -CHAT_COMPLETIONS_SUFFIX.length);
  }
  return normalized;
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

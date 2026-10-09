import { describe, expect, it } from 'vitest';
import { withRequestTimeout } from './requestTimeout';

describe('withRequestTimeout', () => {
  it('propagates an external cancellation as AbortError', async () => {
    const external = new AbortController();
    const request = withRequestTimeout(10_000, (signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
    }), external.signal);

    external.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

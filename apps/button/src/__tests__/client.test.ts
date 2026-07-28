import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HttpButtonApiClient } from '../api/client';
import { ButtonApiError } from '../api/types';

/**
 * The real HTTP transport maps sanitized HTTP statuses to stable error categories and never
 * surfaces backend internals. Uses a stubbed global `fetch`.
 */
describe('HttpButtonApiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(status: number, body: unknown): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response);
  }

  it('returns the context on 200', async () => {
    const context = { user: { displayName: 'x', locale: 'en' } };
    stubFetch(200, { status: 'ok', requestId: 'r', context });
    const client = new HttpButtonApiClient();
    await expect(client.getContext({})).resolves.toEqual(context);
  });

  it.each([
    [401, 'unauthenticated'],
    [403, 'access-denied'],
    [400, 'invalid-selection'],
    [500, 'service-unavailable'],
  ])('maps HTTP %s to the %s category', async (status, category) => {
    stubFetch(status, { status: 'error' });
    const client = new HttpButtonApiClient();
    await expect(client.getContext({ organizationId: 'club-1' })).rejects.toMatchObject({
      category,
      httpStatus: status,
    });
  });

  it('maps a network failure to service-unavailable without leaking detail', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED at 10.0.0.1:5432'));
    const client = new HttpButtonApiClient();
    await expect(client.getContext({})).rejects.toBeInstanceOf(ButtonApiError);
    await expect(client.getContext({})).rejects.toMatchObject({ category: 'service-unavailable' });
  });

  it('builds a query string only from safe selection fields', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok', requestId: 'r', context: {} }),
    } as Response);
    globalThis.fetch = fetchSpy;
    const client = new HttpButtonApiClient();
    await client.getContext({ organizationId: 'club-1', season: '2025-26', locale: 'fr' });
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('organizationId=club-1');
    expect(url).toContain('season=2025-26');
    expect(url).toContain('locale=fr');
  });
});

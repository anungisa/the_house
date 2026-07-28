/**
 * Injectable Button API client.
 *
 * The app depends on the {@link ButtonApiClient} interface, never on `fetch` directly, so tests
 * and end-to-end runs can substitute a deterministic transport. The real transport calls the
 * governed `GET /v1/button/context` endpoint; the mock transport (selected by `VITE_BUTTON_MOCK`)
 * serves synthetic, non-production data for browser tests without a backend.
 */

import {
  ButtonApiError,
  type ButtonContextResponseBody,
  type ButtonContextSelection,
  type ButtonContextView,
  type ButtonErrorCategory,
} from './types';
import { mockContextForScenario, type MockScenario } from './mockData';

export interface ButtonApiClient {
  getContext(selection: ButtonContextSelection): Promise<ButtonContextView>;
}

function categoryForStatus(status: number): ButtonErrorCategory {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'access-denied';
  if (status === 400) return 'invalid-selection';
  return 'service-unavailable';
}

function buildQuery(selection: ButtonContextSelection): string {
  const params = new URLSearchParams();
  if (selection.organizationId) params.set('organizationId', selection.organizationId);
  if (selection.season) params.set('season', selection.season);
  if (selection.locale) params.set('locale', selection.locale);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** Real transport against the governed House HTTP surface. */
export class HttpButtonApiClient implements ButtonApiClient {
  constructor(private readonly baseUrl = '') {}

  async getContext(selection: ButtonContextSelection): Promise<ButtonContextView> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/button/context${buildQuery(selection)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
    } catch {
      // Network/transport failure — never expose the underlying error detail.
      throw new ButtonApiError('service-unavailable', 0, 'The service is temporarily unavailable.');
    }

    if (!response.ok) {
      throw new ButtonApiError(
        categoryForStatus(response.status),
        response.status,
        'The request could not be completed.',
      );
    }

    const body = (await response.json()) as ButtonContextResponseBody;
    return body.context;
  }
}

/** Deterministic mock transport for browser tests and offline development. */
export class MockButtonApiClient implements ButtonApiClient {
  constructor(private readonly scenario: MockScenario = 'representative') {}

  async getContext(selection: ButtonContextSelection): Promise<ButtonContextView> {
    // `async` ensures a synchronous rejection (e.g. an unauthorized org) surfaces as a rejected
    // promise rather than a thrown call.
    return mockContextForScenario(this.scenario, selection);
  }
}

/**
 * Select the client from the build/runtime environment. When `VITE_BUTTON_MOCK` is set the app
 * runs fully offline against synthetic data (used by the e2e browser suite).
 */
export function createButtonApiClient(): ButtonApiClient {
  if (import.meta.env.VITE_BUTTON_MOCK === '1') {
    const scenario = (import.meta.env.VITE_BUTTON_MOCK_SCENARIO as MockScenario) ?? 'representative';
    return new MockButtonApiClient(scenario);
  }
  return new HttpButtonApiClient();
}

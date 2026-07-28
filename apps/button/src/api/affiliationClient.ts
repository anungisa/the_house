/**
 * Injectable Button affiliation-draft API client (Slice C).
 *
 * The app depends on the {@link AffiliationApiClient} interface, never on `fetch` directly, so
 * tests and end-to-end runs can substitute a deterministic transport. The real transport calls the
 * bounded, task-specific `/v1/button/affiliation` endpoints (and the governed evidence upload
 * endpoint) with `credentials: same-origin`; a verifying edge injects the trusted identity headers.
 * The browser NEVER asserts identity, authority, or completeness — every decision is re-authorized
 * server-side.
 *
 * Optimistic concurrency: every projection carries a `concurrencyToken`; the client echoes it as
 * `If-Match` on the next draft write and surfaces a `version-conflict` when the server rejects a
 * stale write (409), so the UI can reconcile without duplicating a mutation.
 */

import {
  AffiliationApiError,
  type AffiliationApplicationProjection,
  type AffiliationErrorCategory,
  type AffiliationOverview,
  type DraftResponseInput,
} from './affiliationTypes';
import { AffiliationMockStore } from './affiliationMockData';

export interface GetOverviewInput {
  readonly organizationId: string;
  readonly season: string;
  readonly pathway?: string;
}

export interface InitiateInput {
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway?: string;
}

export interface SaveDraftInput {
  readonly applicationId: string;
  readonly expectedVersion: string;
  readonly responses: readonly DraftResponseInput[];
}

export interface AssociateEvidenceInput {
  readonly applicationId: string;
  readonly requirementCode: string;
  readonly file: File;
}

export interface RemoveEvidenceInput {
  readonly applicationId: string;
  readonly linkId: string;
}

export interface AffiliationApiClient {
  getOverview(input: GetOverviewInput): Promise<AffiliationOverview>;
  initiate(input: InitiateInput): Promise<AffiliationApplicationProjection>;
  getApplication(applicationId: string): Promise<AffiliationApplicationProjection>;
  saveDraft(input: SaveDraftInput): Promise<AffiliationApplicationProjection>;
  associateEvidence(input: AssociateEvidenceInput): Promise<AffiliationApplicationProjection>;
  removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection>;
}

function categoryFor(status: number, code: string | undefined): AffiliationErrorCategory {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'version-conflict';
  if (status === 400) {
    return code === 'AFFILIATION_EVIDENCE_REFERENCE_INVALID' ? 'evidence-invalid' : 'invalid-input';
  }
  return 'service-unavailable';
}

interface ErrorEnvelope {
  readonly status: 'error';
  readonly code?: string;
  readonly message?: string;
}

/** Real transport against the governed House HTTP surface. */
export class HttpAffiliationApiClient implements AffiliationApiClient {
  constructor(private readonly baseUrl = '') {}

  private async request<T>(
    path: string,
    init: RequestInit,
    extract: (body: unknown) => T,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        credentials: 'same-origin',
        ...init,
      });
    } catch {
      throw new AffiliationApiError('service-unavailable', 0, 'The service is temporarily unavailable.');
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      const envelope = (parsed ?? {}) as ErrorEnvelope;
      throw new AffiliationApiError(
        categoryFor(response.status, envelope.code),
        response.status,
        'The request could not be completed.',
      );
    }
    return extract(parsed);
  }

  async getOverview(input: GetOverviewInput): Promise<AffiliationOverview> {
    const params = new URLSearchParams({ organizationId: input.organizationId, season: input.season });
    if (input.pathway) params.set('pathway', input.pathway);
    return this.request(
      `/v1/button/affiliation?${params.toString()}`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { overview: AffiliationOverview }).overview,
    );
  }

  async initiate(input: InitiateInput): Promise<AffiliationApplicationProjection> {
    return this.request(
      '/v1/button/affiliation/applications',
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: input.organizationId,
          seasonId: input.seasonId,
          ...(input.pathway ? { pathway: input.pathway } : {}),
        }),
      },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async getApplication(applicationId: string): Promise<AffiliationApplicationProjection> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async saveDraft(input: SaveDraftInput): Promise<AffiliationApplicationProjection> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(input.applicationId)}/draft`,
      {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'If-Match': `"${input.expectedVersion}"`,
        },
        body: JSON.stringify({ responses: input.responses }),
      },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async associateEvidence(input: AssociateEvidenceInput): Promise<AffiliationApplicationProjection> {
    // Two governed steps: upload the payload through the evidence boundary, then associate the
    // resulting reference. Association is NOT acceptance — the governed evidence review is separate.
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const uploaded = await this.request(
      '/v1/evidence/objects',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': input.file.type || 'application/octet-stream',
          'x-house-source-filename': encodeURIComponent(input.file.name),
        },
        body: bytes,
      },
      (body) => body as { evidenceObjectId: string; contentHash: string; contentType: string },
    );
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(input.applicationId)}/evidence-links`,
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          requirementCode: input.requirementCode,
          evidenceObjectId: uploaded.evidenceObjectId,
          contentHash: uploaded.contentHash,
          contentType: uploaded.contentType,
          displayName: input.file.name,
        }),
      },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(
        input.applicationId,
      )}/evidence-links/${encodeURIComponent(input.linkId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' } },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }
}

/**
 * Deterministic mock transport for browser tests and offline development. Backed by a stateful
 * in-memory store that mirrors the governed surface (versioning, conflicts, evidence association).
 */
export class MockAffiliationApiClient implements AffiliationApiClient {
  constructor(private readonly store: AffiliationMockStore = new AffiliationMockStore()) {}

  async getOverview(input: GetOverviewInput): Promise<AffiliationOverview> {
    return this.store.overview(input.organizationId, input.season, input.pathway ?? 'new_affiliation');
  }

  async initiate(input: InitiateInput): Promise<AffiliationApplicationProjection> {
    return this.store.initiate(input.organizationId, input.seasonId, input.pathway ?? 'new_affiliation');
  }

  async getApplication(applicationId: string): Promise<AffiliationApplicationProjection> {
    return this.store.getApplication(applicationId);
  }

  async saveDraft(input: SaveDraftInput): Promise<AffiliationApplicationProjection> {
    return this.store.saveDraft(input.applicationId, input.expectedVersion, input.responses);
  }

  async associateEvidence(input: AssociateEvidenceInput): Promise<AffiliationApplicationProjection> {
    return this.store.associateEvidence(input.applicationId, input.requirementCode, input.file.name);
  }

  async removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection> {
    return this.store.removeEvidence(input.applicationId, input.linkId);
  }
}

/**
 * Select the affiliation client from the build/runtime environment. When `VITE_BUTTON_MOCK` is set
 * the app runs fully offline against synthetic data (used by the e2e browser suite).
 */
export function createAffiliationApiClient(): AffiliationApiClient {
  if (import.meta.env.VITE_BUTTON_MOCK === '1') {
    return new MockAffiliationApiClient();
  }
  return new HttpAffiliationApiClient();
}

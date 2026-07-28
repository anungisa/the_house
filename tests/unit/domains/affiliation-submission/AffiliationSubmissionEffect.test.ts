import { describe, expect, it, vi } from 'vitest';

import { PgAffiliationSubmissionEffect } from '../../../../src/domains/affiliation-submission/index.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';
import type {
  DomainEffectContext,
  DomainEffectQueryClient,
  GovernanceTx,
} from '../../../../src/governance/kernel/ports.js';

const context: DomainEffectContext = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  entityType: 'AffiliationApplication',
  entityId: '22222222-2222-4222-8222-222222222222',
  trigger: 'submit',
  fromState: 'draft',
  toState: 'submitted',
  stateTransitionId: '33333333-3333-4333-8333-333333333333',
  actor: {
    actorId: 'representative@example.test',
    tenantId: '11111111-1111-4111-8111-111111111111',
    scopeType: 'local_organization',
  },
  context: {
    tenantId: '11111111-1111-4111-8111-111111111111',
    scopeType: 'local_organization',
  },
  payload: {
    expectedDraftVersion: 4,
    submissionIdempotencyKey: 'submit-1',
  },
};

function txWith(client: DomainEffectQueryClient): GovernanceTx {
  return { raw: () => client } as unknown as GovernanceTx;
}

function clientWith(
  handler: (sql: string, params?: readonly unknown[]) => Promise<Record<string, unknown>[]>,
): DomainEffectQueryClient {
  return {
    query: async <T extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<T[]> => handler(sql, params) as Promise<T[]>,
  };
}

function aggregate(version = 4, incomplete = 0): Record<string, unknown> {
  return {
    application_id: context.entityId,
    organization_id: '44444444-4444-4444-8444-444444444444',
    season_id: '2026-27',
    pathway: 'new_affiliation',
    version,
    requirements: [{ code: 'ORG_PROFILE_CONFIRMATION', version: 1 }],
    responses: { ORG_PROFILE_CONFIRMATION: { confirmed: true } },
    evidence: [],
    incomplete_count: incomplete,
  };
}

describe('PgAffiliationSubmissionEffect', () => {
  it('writes the immutable snapshot in the governed transaction', async () => {
    const inserted: { sql: string; params?: readonly unknown[] }[] = [];
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
        if (sql.includes('FROM affiliation.affiliation_application a')) return [aggregate()];
        if (sql.includes('MAX(sequence)')) return [{ next_sequence: 1 }];
        if (sql.includes('INSERT INTO affiliation.submission_snapshot')) {
          inserted.push({ sql, ...(params !== undefined ? { params } : {}) });
          return [];
        }
        return [];
      });
    const client = clientWith(query);

    const result = await new PgAffiliationSubmissionEffect().apply(txWith(client), context);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.params?.[4]).toBe('submit-1');
    expect(inserted[0]?.params?.[5]).toBe(context.stateTransitionId);
    expect(result?.evidenceManifest).toEqual({
      submissionSequence: 1,
      sourceDraftVersion: 4,
    });
  });

  it('fails deterministically on a stale draft version before inserting a snapshot', async () => {
    const client = clientWith(
      vi.fn(async (sql: string) =>
        sql.includes('FROM affiliation.affiliation_application a') ? [aggregate(5)] : [],
      ),
    );

    await expect(
      new PgAffiliationSubmissionEffect().apply(txWith(client), context),
    ).rejects.toMatchObject({
      code: ErrorCode.AFFILIATION_DRAFT_VERSION_CONFLICT,
    } satisfies Partial<AppError>);
  });

  it('fails closed when server-derived readiness is incomplete', async () => {
    const client = clientWith(
      vi.fn(async (sql: string) =>
        sql.includes('FROM affiliation.affiliation_application a') ? [aggregate(4, 1)] : [],
      ),
    );

    await expect(
      new PgAffiliationSubmissionEffect().apply(txWith(client), context),
    ).rejects.toMatchObject({
      code: ErrorCode.AFFILIATION_SUBMISSION_NOT_READY,
    } satisfies Partial<AppError>);
  });
});

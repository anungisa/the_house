import { describe, it, expect } from 'vitest';

import {
  SeasonCatalogService,
  type CreateSeasonDraftOutcome,
  type SeasonCatalogStore,
  type SeasonMutationOutcome,
  type SeasonRecord,
} from '../../../../src/domains/season-catalog/index.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';

/**
 * Unit tests for the season catalog service: boundary validation, publish COMPLETENESS enforced at
 * the command boundary, store-outcome → AppError mapping, and the representative-facing read paths
 * (catalog + server-side season authorization). The store is a programmable in-memory double.
 */

const NOW = '2025-10-15T12:00:00.000Z';
const TENANT = '11111111-1111-1111-1111-111111111111';

function record(over: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    id: 'row-1',
    tenantId: TENANT,
    seasonId: '2025-26',
    status: 'published',
    isCurrent: true,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    labelEn: '2025-26 EN',
    labelFr: '2025-26 FR',
    seasonStartDate: '2025-09-01',
    seasonEndDate: '2026-08-31',
    ...over,
  };
}

/** Programmable store: reads come from `rows`, commands return the configured outcomes. */
class FakeStore implements SeasonCatalogStore {
  rows: SeasonRecord[] = [];
  createOutcome: CreateSeasonDraftOutcome = { outcome: 'created', record: record({ status: 'draft' }) };
  mutation: SeasonMutationOutcome = { outcome: 'applied', record: record() };

  createDraft(): Promise<CreateSeasonDraftOutcome> {
    return Promise.resolve(this.createOutcome);
  }
  reviseDraft(): Promise<SeasonMutationOutcome> {
    return Promise.resolve(this.mutation);
  }
  publish(): Promise<SeasonMutationOutcome> {
    return Promise.resolve(this.mutation);
  }
  makeCurrent(): Promise<SeasonMutationOutcome> {
    return Promise.resolve(this.mutation);
  }
  openWindow(): Promise<SeasonMutationOutcome> {
    return Promise.resolve(this.mutation);
  }
  closeWindow(): Promise<SeasonMutationOutcome> {
    return Promise.resolve(this.mutation);
  }
  retire(): Promise<SeasonMutationOutcome> {
    return Promise.resolve(this.mutation);
  }
  listPublishedForTenant(): Promise<readonly SeasonRecord[]> {
    return Promise.resolve(this.rows.filter((r) => r.status === 'published'));
  }
  getBySeasonId(_tenantId: string, seasonId: string): Promise<SeasonRecord | undefined> {
    return Promise.resolve(this.rows.find((r) => r.seasonId === seasonId));
  }
  getById(_tenantId: string, id: string): Promise<SeasonRecord | undefined> {
    return Promise.resolve(this.rows.find((r) => r.id === id));
  }
}

function service(store: FakeStore = new FakeStore()): {
  svc: SeasonCatalogService;
  store: FakeStore;
} {
  return { svc: new SeasonCatalogService(store, () => new Date(NOW)), store };
}

const baseCreate = {
  tenantId: TENANT,
  seasonId: '2026-27',
  labelEn: '2026-27',
  labelFr: '2026-27',
  idempotencyKey: 'idem-1',
};

describe('SeasonCatalogService validation', () => {
  it('rejects blank required fields', async () => {
    const { svc } = service();
    await expect(svc.createDraft({ ...baseCreate, seasonId: '  ' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
    await expect(svc.createDraft({ ...baseCreate, labelFr: '' })).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
  });

  it('rejects an inverted date span and window order', async () => {
    const { svc } = service();
    await expect(
      svc.createDraft({ ...baseCreate, seasonStartDate: '2026-09-01', seasonEndDate: '2026-08-01' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
    await expect(
      svc.openWindow({
        tenantId: TENANT,
        seasonId: '2025-26',
        idempotencyKey: 'k',
        applicationOpensAt: '2025-12-01T00:00:00.000Z',
        applicationClosesAt: '2025-11-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });
});

describe('SeasonCatalogService createDraft', () => {
  it('maps a store conflict to SEASON_CONFLICT', async () => {
    const { svc, store } = service();
    store.createOutcome = { outcome: 'conflict', record: record({ status: 'draft' }) };
    await expect(svc.createDraft(baseCreate)).rejects.toMatchObject({
      code: ErrorCode.SEASON_CONFLICT,
    });
  });
});

describe('SeasonCatalogService publish completeness', () => {
  it('rejects publishing a draft that lacks labels or dates', async () => {
    const { svc, store } = service();
    store.rows = [record({ status: 'draft', labelFr: undefined, seasonEndDate: undefined })];
    await expect(
      svc.publish({ tenantId: TENANT, seasonId: '2025-26', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_CONFLICT });
  });

  it('rejects publishing an unknown season with SEASON_NOT_FOUND', async () => {
    const { svc } = service();
    await expect(
      svc.publish({ tenantId: TENANT, seasonId: 'nope', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_NOT_FOUND });
  });

  it('publishes a complete draft', async () => {
    const { svc, store } = service();
    store.rows = [record({ status: 'draft' })];
    store.mutation = { outcome: 'applied', record: record({ status: 'published' }) };
    const result = await svc.publish({ tenantId: TENANT, seasonId: '2025-26', idempotencyKey: 'k' });
    expect(result.status).toBe('published');
  });
});

describe('SeasonCatalogService outcome mapping', () => {
  it('maps not_found / version_conflict / invalid_state', async () => {
    const { svc, store } = service();
    store.mutation = { outcome: 'not_found' };
    await expect(
      svc.makeCurrent({ tenantId: TENANT, seasonId: '2025-26', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_NOT_FOUND });

    store.mutation = { outcome: 'version_conflict', record: record({ version: 5 }) };
    await expect(
      svc.makeCurrent({ tenantId: TENANT, seasonId: '2025-26', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_CONFLICT });

    store.mutation = { outcome: 'invalid_state', record: record({ status: 'draft' }) };
    await expect(
      svc.makeCurrent({ tenantId: TENANT, seasonId: '2025-26', idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_CONFLICT });
  });

  it('returns the record for applied and replayed outcomes', async () => {
    const { svc, store } = service();
    store.mutation = { outcome: 'replayed', record: record({ isCurrent: true }) };
    const result = await svc.makeCurrent({
      tenantId: TENANT,
      seasonId: '2025-26',
      idempotencyKey: 'k',
    });
    expect(result.isCurrent).toBe(true);
  });
});

describe('SeasonCatalogService reads', () => {
  it('projects the published catalog (current first) and hides drafts', async () => {
    const { svc, store } = service();
    store.rows = [
      record({ id: 'a', seasonId: '2024-25', isCurrent: false, seasonStartDate: '2024-09-01', seasonEndDate: '2025-08-31' }),
      record({ id: 'b', seasonId: '2025-26', isCurrent: true }),
      record({ id: 'c', seasonId: 'draft-1', status: 'draft' }),
    ];
    const seasons = await svc.seasons(TENANT, NOW, 'en');
    expect(seasons.map((s) => s.id)).toEqual(['2025-26', '2024-25']);
  });

  it('resolveSeason returns unavailable for unknown / draft / retired, ok for published', async () => {
    const { svc, store } = service();
    store.rows = [
      record({ id: 'b', seasonId: '2025-26', isCurrent: true }),
      record({ id: 'c', seasonId: 'draft-1', status: 'draft' }),
      record({ id: 'd', seasonId: 'retired-1', status: 'retired' }),
    ];
    expect((await svc.resolveSeason(TENANT, 'missing', NOW)).outcome).toBe('unavailable');
    expect((await svc.resolveSeason(TENANT, 'draft-1', NOW)).outcome).toBe('unavailable');
    expect((await svc.resolveSeason(TENANT, 'retired-1', NOW)).outcome).toBe('unavailable');
    const ok = await svc.resolveSeason(TENANT, '2025-26', NOW);
    expect(ok.outcome).toBe('ok');
  });
});

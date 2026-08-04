import { describe, it, expect } from 'vitest';

import {
  InMemoryJurisdictionStore,
  JurisdictionCatalogService,
  JURISDICTION_ASSIGNED_MESSAGE_TYPE,
  JURISDICTION_CREATED_MESSAGE_TYPE,
  JURISDICTION_PUBLISHED_MESSAGE_TYPE,
} from '../../../../src/domains/jurisdiction/index.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';

/**
 * Unit tests for the governed jurisdiction application service over the in-memory store double:
 * boundary validation, publish/assign COMPLETENESS enforced at the command boundary, idempotent
 * replay, one-active-primary conflict, direct-override via replace, revoke, and store-outcome →
 * AppError mapping. Every command captures exactly one transactional outbox message.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';

function service(): { svc: JurisdictionCatalogService; store: InMemoryJurisdictionStore } {
  const store = new InMemoryJurisdictionStore(() => new Date('2026-01-15T00:00:00.000Z'));
  return { svc: new JurisdictionCatalogService(store), store };
}

async function seedPublished(
  svc: JurisdictionCatalogService,
  code: string,
): Promise<void> {
  await svc.createDraft({
    tenantId: TENANT,
    idempotencyKey: `create:${code}`,
    code,
    level: 'subdivision',
    labelEn: `${code} EN`,
    labelFr: `${code} FR`,
  });
  await svc.publish({ tenantId: TENANT, idempotencyKey: `publish:${code}`, code });
}

describe('JurisdictionCatalogService — catalog', () => {
  it('creates a DRAFT and enqueues a single created outbox message', async () => {
    const { svc, store } = service();
    const record = await svc.createDraft({
      tenantId: TENANT,
      idempotencyKey: 'create:on',
      code: 'on',
      level: 'subdivision',
      labelEn: 'Ontario',
      labelFr: 'Ontario',
    });

    expect(record).toMatchObject({ code: 'on', status: 'draft', version: 1 });
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]?.messageType).toBe(JURISDICTION_CREATED_MESSAGE_TYPE);
  });

  it('rejects a blank code / label at the boundary (INVALID_INPUT)', async () => {
    const { svc } = service();
    await expect(
      svc.createDraft({
        tenantId: TENANT,
        idempotencyKey: 'k',
        code: '  ',
        level: 'local',
        labelEn: 'x',
        labelFr: 'y',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a duplicate code (JURISDICTION_CONFLICT)', async () => {
    const { svc } = service();
    await svc.createDraft({
      tenantId: TENANT,
      idempotencyKey: 'create:on',
      code: 'on',
      level: 'subdivision',
      labelEn: 'Ontario',
      labelFr: 'Ontario',
    });
    await expect(
      svc.createDraft({
        tenantId: TENANT,
        idempotencyKey: 'create:on-2',
        code: 'on',
        level: 'subdivision',
        labelEn: 'Ontario',
        labelFr: 'Ontario',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_CONFLICT });
  });

  it('rejects a create referencing a missing parent (JURISDICTION_NOT_FOUND)', async () => {
    const { svc } = service();
    await expect(
      svc.createDraft({
        tenantId: TENANT,
        idempotencyKey: 'create:club',
        code: 'club',
        level: 'local',
        labelEn: 'Club',
        labelFr: 'Club',
        parentJurisdictionCode: 'ghost',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_NOT_FOUND });
  });

  it('replays create idempotently without a second outbox message', async () => {
    const { svc, store } = service();
    const command = {
      tenantId: TENANT,
      idempotencyKey: 'create:on',
      code: 'on',
      level: 'subdivision' as const,
      labelEn: 'Ontario',
      labelFr: 'Ontario',
    };
    const first = await svc.createDraft(command);
    const second = await svc.createDraft(command);

    expect(second.id).toBe(first.id);
    expect(store.outbox).toHaveLength(1);
  });

  it('blocks publish of a draft missing a bilingual label (JURISDICTION_CONFLICT)', async () => {
    const { svc, store } = service();
    // Seed a draft head directly with a blank French label (createDraft would reject it at the
    // boundary) to exercise the publish-completeness defense on the existing head.
    store.seedJurisdiction({
      id: 'j-on',
      tenantId: TENANT,
      code: 'on',
      level: 'subdivision',
      labelEn: 'Ontario',
      labelFr: ' ',
      status: 'draft',
      version: 1,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    });
    await expect(
      svc.publish({ tenantId: TENANT, idempotencyKey: 'publish:on', code: 'on' }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_CONFLICT });
  });

  it('publishes a complete draft (draft → published) and enqueues a published message', async () => {
    const { svc, store } = service();
    await seedPublished(svc, 'on');
    const head = await svc.getJurisdiction(TENANT, 'on');

    expect(head?.status).toBe('published');
    expect(store.outbox.map((m) => m.messageType)).toContain(JURISDICTION_PUBLISHED_MESSAGE_TYPE);
  });

  it('maps a publish of an unknown code to JURISDICTION_NOT_FOUND', async () => {
    const { svc } = service();
    await expect(
      svc.publish({ tenantId: TENANT, idempotencyKey: 'publish:ghost', code: 'ghost' }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_NOT_FOUND });
  });
});

describe('JurisdictionCatalogService — assignments', () => {
  it('requires a source reference to assign (INVALID_INPUT)', async () => {
    const { svc } = service();
    await seedPublished(svc, 'on');
    await expect(
      svc.assignPrimary({
        tenantId: TENANT,
        idempotencyKey: 'assign:1',
        organizationId: 'club-1',
        jurisdictionCode: 'on',
        inheritanceMode: 'direct',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('assigns a published jurisdiction as the primary and enqueues an assigned message', async () => {
    const { svc, store } = service();
    await seedPublished(svc, 'on');
    const assignment = await svc.assignPrimary({
      tenantId: TENANT,
      idempotencyKey: 'assign:1',
      organizationId: 'club-1',
      jurisdictionCode: 'on',
      inheritanceMode: 'inheritable',
      sourceReference: 'board-motion-2026-01',
    });

    expect(assignment).toMatchObject({ organizationId: 'club-1', status: 'active', version: 1 });
    expect(store.outbox.map((m) => m.messageType)).toContain(JURISDICTION_ASSIGNED_MESSAGE_TYPE);
  });

  it('rejects assigning a jurisdiction that is not published (JURISDICTION_UNAVAILABLE)', async () => {
    const { svc } = service();
    await svc.createDraft({
      tenantId: TENANT,
      idempotencyKey: 'create:on',
      code: 'on',
      level: 'subdivision',
      labelEn: 'Ontario',
      labelFr: 'Ontario',
    });
    await expect(
      svc.assignPrimary({
        tenantId: TENANT,
        idempotencyKey: 'assign:1',
        organizationId: 'club-1',
        jurisdictionCode: 'on',
        inheritanceMode: 'direct',
        sourceReference: 'ref',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_UNAVAILABLE });
  });

  it('rejects a second active primary assignment (JURISDICTION_CONFLICT)', async () => {
    const { svc } = service();
    await seedPublished(svc, 'on');
    await seedPublished(svc, 'qc');
    await svc.assignPrimary({
      tenantId: TENANT,
      idempotencyKey: 'assign:1',
      organizationId: 'club-1',
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    await expect(
      svc.assignPrimary({
        tenantId: TENANT,
        idempotencyKey: 'assign:2',
        organizationId: 'club-1',
        jurisdictionCode: 'qc',
        inheritanceMode: 'direct',
        sourceReference: 'ref',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_CONFLICT });
  });

  it('replaces the active primary (revoke + assign) and revokes the prior', async () => {
    const { svc, store } = service();
    await seedPublished(svc, 'on');
    await seedPublished(svc, 'qc');
    const first = await svc.assignPrimary({
      tenantId: TENANT,
      idempotencyKey: 'assign:1',
      organizationId: 'club-1',
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    const replaced = await svc.replacePrimary({
      tenantId: TENANT,
      idempotencyKey: 'replace:1',
      organizationId: 'club-1',
      jurisdictionCode: 'qc',
      inheritanceMode: 'direct',
      sourceReference: 'ref-2',
    });

    expect(replaced.id).not.toBe(first.id);
    const active = await svc.activeAssignments(TENANT, 'club-1');
    expect(active.map((a) => a.id)).toEqual([replaced.id]);
    expect(store.outbox.map((m) => m.messageType)).toContain('jurisdiction.assignment_replaced');
  });

  it('revokes the active primary and maps a second revoke to NOT_FOUND', async () => {
    const { svc } = service();
    await seedPublished(svc, 'on');
    await svc.assignPrimary({
      tenantId: TENANT,
      idempotencyKey: 'assign:1',
      organizationId: 'club-1',
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    const revoked = await svc.revoke({
      tenantId: TENANT,
      idempotencyKey: 'revoke:1',
      organizationId: 'club-1',
    });
    expect(revoked.status).toBe('revoked');
    expect(await svc.activeAssignments(TENANT, 'club-1')).toHaveLength(0);

    await expect(
      svc.revoke({ tenantId: TENANT, idempotencyKey: 'revoke:2', organizationId: 'club-1' }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_NOT_FOUND });
  });

  it('projects only PUBLISHED jurisdictions in the catalog read, localized', async () => {
    const { svc } = service();
    await seedPublished(svc, 'on');
    await svc.createDraft({
      tenantId: TENANT,
      idempotencyKey: 'create:draft',
      code: 'draft-only',
      level: 'local',
      labelEn: 'Draft',
      labelFr: 'Brouillon',
    });

    const catalog = await svc.publishedCatalog(TENANT, 'fr');
    expect(catalog.map((c) => c.code)).toEqual(['on']);
    expect(catalog[0]?.label).toBe('on FR');
  });
});

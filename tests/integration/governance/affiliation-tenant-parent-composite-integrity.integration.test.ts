import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Gated PostgreSQL integration coverage for migration 0020 composite tenant-parent integrity.
 *
 * Proves, via raw admin SQL (RLS bypass for setup), that same-tenant children are accepted while
 * cross-tenant and dangling child-parent links are physically rejected for:
 * - affiliation child -> affiliation_application relationships,
 * - affiliation_finance child -> financial_obligation relationships,
 * - affiliation_standing child -> affiliation_standing relationships.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const FK_VIOLATION = '23503';

let admin: pg.Pool;

async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected SQLSTATE ${code}, but statement succeeded.`);
  } catch (err) {
    expect((err as { code?: string }).code).toBe(code);
  }
}

async function insertApplication(tenantId: string, applicationId: string): Promise<void> {
  await admin.query(
    `INSERT INTO affiliation.affiliation_application
       (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status)
     VALUES ($1, $2, '2025-26', true, true, 'paid')`,
    [applicationId, tenantId],
  );
}

async function insertFinancialObligation(input: {
  tenantId: string;
  obligationId: string;
  applicationId: string;
}): Promise<void> {
  await admin.query(
    `INSERT INTO affiliation_finance.financial_obligation
       (id, tenant_id, affiliation_application_id, subject_id, season,
        obligation_type, assessment_basis, assessed_amount, currency, blocking, assessed_by)
     VALUES ($1, $2, $3, $4, '2025-26',
             'affiliation_fee', 'base', 100.00, 'CAD', true, $5)`,
    [
      input.obligationId,
      input.tenantId,
      input.applicationId,
      randomUUID(),
      randomUUID(),
    ],
  );
}

async function insertStanding(tenantId: string, standingId: string, applicationId: string): Promise<void> {
  await admin.query(
    `INSERT INTO affiliation_standing.affiliation_standing
       (id, tenant_id, affiliation_application_id, subject_id, season, standing_version,
        effective_from, effective_until, pathway, established_by)
     VALUES ($1, $2, $3, $4, '2025-26', 1,
             now(), now() + interval '1 year', 'new_affiliation', $5)`,
    [standingId, tenantId, applicationId, randomUUID(), randomUUID()],
  );
}

type InsertCase = {
  readonly label: string;
  insert: (tenantId: string, parentId: string) => Promise<unknown>;
};

d('affiliation tenant-parent composite integrity (migration 0020)', () => {
  beforeAll(() => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
  });

  afterAll(async () => {
    await admin.end();
  });

  it('enforces same-tenant application parent FKs across affiliation child tables', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const appA = randomUUID();

    await insertApplication(tenantA, appA);

    const cases: readonly InsertCase[] = [
      {
        label: 'application_document',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.application_document
               (tenant_id, application_id, document_type, required, status)
             VALUES ($1, $2, 'governing_document', true, 'approved')`,
            [tenantId, parentId],
          ),
      },
      {
        label: 'compliance_flag',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.compliance_flag
               (tenant_id, application_id, flag_type, status)
             VALUES ($1, $2, 'policy_check', 'open')`,
            [tenantId, parentId],
          ),
      },
      {
        label: 'payment_obligation',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.payment_obligation
               (tenant_id, application_id, obligation_type, status, amount_cents, currency)
             VALUES ($1, $2, 'affiliation_fee', 'unpaid', 10000, 'CAD')`,
            [tenantId, parentId],
          ),
      },
      {
        label: 'application_requirement',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.application_requirement
               (tenant_id, application_id, requirement_code, requirement_version, applies_because)
             VALUES ($1, $2, $3, 1, 'integration-test')`,
            [tenantId, parentId, `REQ-${randomUUID()}`],
          ),
      },
      {
        label: 'draft_response',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.draft_response
               (tenant_id, application_id, requirement_code, response_value)
             VALUES ($1, $2, $3, '{}'::jsonb)`,
            [tenantId, parentId, `REQ-${randomUUID()}`],
          ),
      },
      {
        label: 'draft_evidence_link',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.draft_evidence_link
               (tenant_id, application_id, requirement_code, evidence_object_id,
                content_hash, content_type, display_name)
             VALUES ($1, $2, $3, $4, $5, 'application/pdf', 'synthetic.pdf')`,
            [tenantId, parentId, `REQ-${randomUUID()}`, randomUUID(), randomUUID()],
          ),
      },
      {
        label: 'draft_change_event',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation.draft_change_event
               (tenant_id, application_id, actor, event_type, detail)
             VALUES ($1, $2, $3, 'draft_saved', '{}'::jsonb)`,
            [tenantId, parentId, randomUUID()],
          ),
      },
    ];

    for (const testCase of cases) {
      await expect(testCase.insert(tenantA, appA)).resolves.toBeDefined();
      await expectSqlState(testCase.insert(tenantB, appA), FK_VIOLATION);
      await expectSqlState(testCase.insert(tenantA, randomUUID()), FK_VIOLATION);
    }

    // application_draft uses application_id as its PK; verify the composite FK before creating
    // the same-tenant row so the cross-tenant case is a tenant-parent FK failure (not PK conflict).
    await expectSqlState(
      admin.query(
        `INSERT INTO affiliation.application_draft
           (application_id, tenant_id, version)
         VALUES ($1, $2, 1)`,
        [appA, tenantB],
      ),
      FK_VIOLATION,
    );
    await expectSqlState(
      admin.query(
        `INSERT INTO affiliation.application_draft
           (application_id, tenant_id, version)
         VALUES ($1, $2, 1)`,
        [randomUUID(), tenantA],
      ),
      FK_VIOLATION,
    );
    await expect(
      admin.query(
        `INSERT INTO affiliation.application_draft
           (application_id, tenant_id, version)
         VALUES ($1, $2, 1)`,
        [appA, tenantA],
      ),
    ).resolves.toBeDefined();
  });

  it('enforces same-tenant obligation parent FKs across finance child tables', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const appA = randomUUID();
    const obligationA = randomUUID();

    await insertApplication(tenantA, appA);
    await insertFinancialObligation({ tenantId: tenantA, obligationId: obligationA, applicationId: appA });

    const cases: readonly InsertCase[] = [
      {
        label: 'obligation_assessment',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation_finance.obligation_assessment
               (tenant_id, obligation_id, version, amount, currency, basis, recorded_by)
             VALUES ($1, $2, 1, 100.00, 'CAD', 'integration-test', $3)`,
            [tenantId, parentId, randomUUID()],
          ),
      },
      {
        label: 'obligation_external_event',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation_finance.obligation_external_event
               (tenant_id, obligation_id, event_kind, external_reference, amount, currency, recorded_by)
             VALUES ($1, $2, 'accounting_confirmation', $3, 100.00, 'CAD', $4)`,
            [tenantId, parentId, `acct-${randomUUID()}`, randomUUID()],
          ),
      },
      {
        label: 'obligation_reconciliation',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation_finance.obligation_reconciliation
               (tenant_id, obligation_id, expected_amount, confirmed_amount,
                discrepancy_amount, currency, outcome, recorded_by)
             VALUES ($1, $2, 100.00, 100.00, 0.00, 'CAD', 'matched', $3)`,
            [tenantId, parentId, randomUUID()],
          ),
      },
      {
        label: 'obligation_clearance',
        insert: (tenantId, parentId) =>
          admin.query(
            `INSERT INTO affiliation_finance.obligation_clearance
               (tenant_id, obligation_id, clearance_kind, reason, authorized_by)
             VALUES ($1, $2, 'waiver', 'integration-test', $3)`,
            [tenantId, parentId, randomUUID()],
          ),
      },
    ];

    for (const testCase of cases) {
      await expect(testCase.insert(tenantA, obligationA)).resolves.toBeDefined();
      await expectSqlState(testCase.insert(tenantB, obligationA), FK_VIOLATION);
      await expectSqlState(testCase.insert(tenantA, randomUUID()), FK_VIOLATION);
    }
  });

  it('enforces same-tenant standing parent FKs for standing period/event history', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const appA = randomUUID();
    const standingA = randomUUID();

    await insertApplication(tenantA, appA);
    await insertStanding(tenantA, standingA, appA);

    const insertPeriod = (tenantId: string, parentId: string): Promise<unknown> =>
      admin.query(
        `INSERT INTO affiliation_standing.standing_period
           (tenant_id, standing_id, version, effective_from, effective_until,
            pathway, reason, recorded_by)
         VALUES ($1, $2, 1, now(), now() + interval '1 year',
                 'new_affiliation', 'integration-test', $3)`,
        [tenantId, parentId, randomUUID()],
      );

    const insertEvent = (tenantId: string, parentId: string): Promise<unknown> =>
      admin.query(
        `INSERT INTO affiliation_standing.standing_event
           (tenant_id, standing_id, event_kind, reason, recorded_by)
         VALUES ($1, $2, 'renewal', 'integration-test', $3)`,
        [tenantId, parentId, randomUUID()],
      );

    await expect(insertPeriod(tenantA, standingA)).resolves.toBeDefined();
    await expect(insertEvent(tenantA, standingA)).resolves.toBeDefined();

    await expectSqlState(insertPeriod(tenantB, standingA), FK_VIOLATION);
    await expectSqlState(insertEvent(tenantB, standingA), FK_VIOLATION);

    await expectSqlState(insertPeriod(tenantA, randomUUID()), FK_VIOLATION);
    await expectSqlState(insertEvent(tenantA, randomUUID()), FK_VIOLATION);
  });
});

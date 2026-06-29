import { describe, it, expect } from 'vitest';
import {
  DEMO_DEFAULTS,
  buildAffiliationDemoStatements,
  resolveDemoIds,
  resolveStateMachineId,
  runAffiliationDemoSeed,
  type DemoIds,
  type SeedQueryClient,
} from '../../../src/http/demo/affiliationDemoSeed.js';

/**
 * Unit tests for the local/demo affiliation seed (src/http/demo/affiliationDemoSeed.ts).
 *
 * The seed builder is pure, so the prepared statements are asserted without a database.
 * A recording fake client verifies execution order and that NO lifecycle transition runs.
 */

const IDS: DemoIds = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  applicationId: '22222222-2222-2222-2222-222222222222',
  seasonId: '2026',
  actorUserId: '33333333-3333-3333-3333-333333333333',
};

/** Curling/sport-specific terms that MUST NOT leak into the NSO-generic platform core. */
const SPORT_TERMS = /\b(ptso|curler|curling|bonspiel|rink|sheet|skip|club|member-?association)\b/i;

class RecordingClient implements SeedQueryClient {
  readonly calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  constructor(private readonly stateMachineRows: Array<{ id: string }>) {}

  query<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]> {
    this.calls.push({ sql, params });
    if (/FROM governance\.state_machine/.test(sql)) {
      return Promise.resolve(this.stateMachineRows as unknown as T[]);
    }
    return Promise.resolve([] as T[]);
  }
}

describe('resolveDemoIds', () => {
  // (5) Deterministic defaults when env is unset.
  it('uses deterministic demo defaults when env is empty', () => {
    expect(resolveDemoIds({})).toEqual(DEMO_DEFAULTS);
  });

  // (5) Accepts env-provided IDs.
  it('reads env-provided IDs', () => {
    const ids = resolveDemoIds({
      DEMO_TENANT_ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      DEMO_APPLICATION_ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      DEMO_SEASON_ID: '2099',
      DEMO_ACTOR_USER_ID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    });
    expect(ids.tenantId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(ids.applicationId).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    expect(ids.seasonId).toBe('2099');
    expect(ids.actorUserId).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
  });

  it('treats whitespace-only env values as unset', () => {
    expect(resolveDemoIds({ DEMO_SEASON_ID: '   ' }).seasonId).toBe(DEMO_DEFAULTS.seasonId);
  });
});

describe('buildAffiliationDemoStatements', () => {
  const statements = buildAffiliationDemoStatements(IDS, 'sm-1');
  const byLabel = (label: string): string =>
    statements.find((s) => s.label === label)?.sql ?? '';

  it('produces exactly the four expected seed statements', () => {
    expect(statements.map((s) => s.label)).toEqual([
      'affiliation_application',
      'application_document',
      'season',
      'entity_state(draft)',
    ]);
  });

  // (7) Prepares the facts a successful submit needs.
  it('marks required fields complete and documents verified', () => {
    const sql = byLabel('affiliation_application');
    expect(sql).toMatch(/required_fields_complete\s*=\s*true|true,\s*true/);
    expect(sql).toContain('affiliation.affiliation_application');
  });

  it('seeds one approved required document idempotently (no DELETE)', () => {
    const sql = byLabel('application_document');
    expect(sql).toContain("'approved'");
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it('marks the demo season current', () => {
    const sql = byLabel('season');
    expect(sql).toContain('is_current');
    expect(sql).toContain('DO UPDATE SET is_current = true');
  });

  // (8) Seeds ONLY the initial draft governed state; never advances; runs no transition.
  it('seeds only the initial draft state and never advances lifecycle', () => {
    const sql = byLabel('entity_state(draft)');
    expect(sql).toContain("'draft'");
    expect(sql).toContain('ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING');
    for (const future of ['submitted', 'under_review', 'approved', 'active', 'archived']) {
      expect(sql).not.toContain(`'${future}'`);
    }
  });

  it('writes no governance journal/audit/transition rows', () => {
    const all = statements.map((s) => s.sql).join('\n');
    expect(all).not.toMatch(/governance\.state_transition/);
    expect(all).not.toMatch(/governance\.audit_event/);
    expect(all).not.toMatch(/governance\.transition_request/);
  });

  // (6) No sport-specific core fields/terms leak into the platform core.
  it('contains no Curling/sport-specific terminology', () => {
    const all = statements
      .map((s) => `${s.label} ${s.sql} ${JSON.stringify(s.params)}`)
      .join('\n');
    expect(all).not.toMatch(SPORT_TERMS);
  });
});

describe('resolveStateMachineId', () => {
  it('returns the active state machine id', async () => {
    const client = new RecordingClient([{ id: 'sm-active' }]);
    await expect(resolveStateMachineId(client)).resolves.toBe('sm-active');
  });

  it('throws a migrate hint when none is found', async () => {
    const client = new RecordingClient([]);
    await expect(resolveStateMachineId(client)).rejects.toThrow(/db:migrate/);
  });
});

describe('runAffiliationDemoSeed', () => {
  it('resolves the state machine, runs four inserts, and performs no transition', async () => {
    const client = new RecordingClient([{ id: 'sm-1' }]);
    await runAffiliationDemoSeed(client, IDS);

    // 1 state_machine lookup + 4 seed statements.
    expect(client.calls).toHaveLength(5);
    expect(client.calls[0]!.sql).toMatch(/FROM governance\.state_machine/);

    const mutations = client.calls.slice(1).map((c) => c.sql);
    expect(mutations).toHaveLength(4);
    // Every mutation is an INSERT (no UPDATE of governed state outside the upserts above).
    for (const sql of mutations) {
      expect(sql.trimStart().startsWith('INSERT')).toBe(true);
    }
    // No call attempts a governed transition write.
    const all = client.calls.map((c) => c.sql).join('\n');
    expect(all).not.toMatch(/governance\.state_transition/);
  });
});

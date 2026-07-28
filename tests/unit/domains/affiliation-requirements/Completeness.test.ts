import { describe, it, expect } from 'vitest';

import {
  resolveApplicableRequirements,
  computeCompleteness,
  type ApplicableRequirement,
  type RequirementDefinition,
  type DraftEvidenceLinkView,
} from '../../../../src/domains/affiliation-requirements/index.js';

/**
 * Unit tests for the named applicability resolver and the server-derived completeness engine.
 * Bounded, deterministic, NO dynamic expression evaluation.
 */

function def(over: Partial<RequirementDefinition> & { id: string; code: string; version: number }): RequirementDefinition {
  return {
    responseType: 'acknowledgement',
    evidenceRequired: false,
    titleEn: 'T',
    guidanceEn: 'G',
    titleFr: 'T',
    guidanceFr: 'G',
    applicability: {},
    institutionalSource: 'National Affiliation Policy',
    active: true,
    ...over,
  };
}

describe('resolveApplicableRequirements', () => {
  it('treats an omitted dimension as a wildcard and a present dimension as a membership gate', () => {
    const catalog: RequirementDefinition[] = [
      def({ id: 'ALL@1', code: 'ALL', version: 1, applicability: {} }),
      def({ id: 'LOCAL@1', code: 'LOCAL', version: 1, applicability: { orgTypes: ['local'] } }),
      def({
        id: 'NAT@1',
        code: 'NAT',
        version: 1,
        applicability: { orgTypes: ['national'] },
      }),
    ];
    const applicable = resolveApplicableRequirements(catalog, {
      orgType: 'local',
      jurisdiction: 'member',
      pathway: 'new_affiliation',
      season: '2025-26',
    });
    expect(applicable.map((a) => a.definition.code).sort()).toEqual(['ALL', 'LOCAL']);
  });
});

describe('computeCompleteness', () => {
  const requirement = (
    code: string,
    evidenceRequired: boolean,
  ): ApplicableRequirement => ({
    definition: def({ id: `${code}@1`, code, version: 1, evidenceRequired }),
    appliesBecause: 'applies',
  });

  const evidenceLink = (code: string): DraftEvidenceLinkView => ({
    linkId: `link-${code}`,
    requirementCode: code,
    evidenceObjectId: 'ev',
    contentHash: 'h',
    contentType: 'application/pdf',
    associatedAt: '2026-01-15T00:00:00.000Z',
  });

  it('distinguishes not_started / answered / evidence_required / evidence_associated', () => {
    const applicable = [requirement('PLAIN', false), requirement('DOC', true)];
    const { requirements, completeness } = computeCompleteness({
      applicable,
      responses: new Map([['PLAIN', { ok: true }]]),
      evidence: new Map(),
    });
    const byCode = (c: string) => requirements.find((r) => r.code === c);
    expect(byCode('PLAIN')?.status).toBe('answered');
    expect(byCode('PLAIN')?.complete).toBe(true);
    // DOC answered? no response, no evidence => not_started.
    expect(byCode('DOC')?.status).toBe('not_started');
    expect(completeness.eligibleForSubmission).toBe(false);

    const withDoc = computeCompleteness({
      applicable,
      responses: new Map([
        ['PLAIN', { ok: true }],
        ['DOC', { confirmed: true }],
      ]),
      evidence: new Map([['DOC', [evidenceLink('DOC')]]]),
    });
    expect(withDoc.requirements.find((r) => r.code === 'DOC')?.status).toBe('evidence_associated');
    expect(withDoc.completeness.eligibleForSubmission).toBe(true);
  });
});

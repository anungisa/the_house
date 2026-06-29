import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pass G — (13) the two-tier review model must use GENERIC review tiers (regional_review /
 * national_review) only, and (14) no sport-specific or organization-specific terminology may
 * leak into the platform-core workflow module. Sport profiles map their own bodies (e.g.
 * provincial/territorial bodies -> regional, the national body -> national) onto these
 * generic tiers OUTSIDE platform core.
 */
const SPORT_TERMS =
  /\bPTSO\b|\bMA\b|\bCC\b|curl|curler|bonspiel|hockey|\bskip\b|\brink\b|\bsheet\b|athlete|coach|\bclub\b|league|\bteam\b|\bbonspiel\b/i;

const here = dirname(fileURLToPath(import.meta.url));
const workflowDir = join(here, '../../../../src/governance/workflow');

describe('workflow metadata module stays NSO-generic', () => {
  const files = readdirSync(workflowDir).filter((f) => f.endsWith('.ts'));

  it('has source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('(14) contains no sport-specific / organization-specific terminology', () => {
    for (const file of files) {
      const contents = readFileSync(join(workflowDir, file), 'utf8');
      expect(SPORT_TERMS.test(contents), `${file} contains sport/org-specific terms`).toBe(false);
    }
  });

  it('(13) uses only the generic regional_review / national_review tiers', () => {
    for (const file of files) {
      const contents = readFileSync(join(workflowDir, file), 'utf8');
      // Review TIER literals (the `*_review` token that is a tier value). The workflow-type
      // identifier `affiliation_two_tier_review` is not a tier and is excluded.
      const tierLiterals = (contents.match(/'[a-z_]+_review'/g) ?? []).filter(
        (l) => l !== "'affiliation_two_tier_review'",
      );
      for (const literal of tierLiterals) {
        expect(['\'regional_review\'', '\'national_review\''], `${file}: ${literal}`).toContain(
          literal,
        );
      }
    }
  });
});

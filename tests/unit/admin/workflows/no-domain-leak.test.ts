import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * (14) The workflow admin/reviewer surface must stay NSO-generic: no sport-specific or
 * organization-specific terminology may leak into the platform-core admin client, view-model,
 * or types. Sport profiles map their own vocabulary onto the generic regional/national tiers
 * OUTSIDE platform core, so no such term is ever required by this surface.
 */
const SPORT_TERMS =
  /\bPTSO\b|\bMA\b|\bCC\b|curl|curler|bonspiel|hockey|\bskip\b|\brink\b|\bsheet\b|athlete|coach|\bclub\b|league|\bteam\b/i;

const here = dirname(fileURLToPath(import.meta.url));
const adminWorkflowsDir = join(here, '../../../../src/admin/workflows');

describe('workflow admin surface stays NSO-generic', () => {
  const files = readdirSync(adminWorkflowsDir).filter((f) => f.endsWith('.ts'));

  it('has source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('(14) contains no sport-specific / organization-specific terminology', () => {
    for (const file of files) {
      const contents = readFileSync(join(adminWorkflowsDir, file), 'utf8');
      expect(SPORT_TERMS.test(contents), `${file} contains sport/org-specific terms`).toBe(false);
    }
  });
});

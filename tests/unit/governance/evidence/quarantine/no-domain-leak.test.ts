import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The evidence quarantine workflow must stay NSO-generic: it is platform security
 * infrastructure, not a sport-specific or domain-specific module. This guard scans the
 * quarantine module source for any leaked sport/domain terminology.
 */
const SPORT_TERMS = /curl|curler|bonspiel|hockey|\bskip\b|\brink\b|\bsheet\b|athlete|coach|\bclub\b|league|\bteam\b|ptso/i;

const here = dirname(fileURLToPath(import.meta.url));
const quarantineDir = join(here, '../../../../../src/governance/evidence/quarantine');

describe('evidence quarantine module stays NSO-generic', () => {
  it('contains no sport-specific terminology', () => {
    const files = readdirSync(quarantineDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(join(quarantineDir, file), 'utf8');
      expect(SPORT_TERMS.test(contents), `${file} contains sport/org-specific terms`).toBe(false);
    }
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * (16) The evidence storage layer must stay NSO-generic: it is platform infrastructure, not a
 * sport-specific or domain-specific document system. This guard scans the module source for
 * any leaked sport/domain terminology.
 */
const SPORT_TERMS = /curl|curler|bonspiel|hockey|\bskip\b|\brink\b|\bsheet\b|athlete|coach|\bclub\b|league|\bteam\b/i;

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(here, '../../../../src/governance/evidence');

describe('evidence storage stays NSO-generic', () => {
  it('contains no sport-specific terminology', () => {
    const files = readdirSync(evidenceDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(join(evidenceDir, file), 'utf8');
      expect(SPORT_TERMS.test(contents), `${file} contains sport-specific terms`).toBe(false);
    }
  });
});

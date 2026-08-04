import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Guard test: the clock-derived season catalog is a TEST/DEMO double only. Production composition
 * must wire the governed, PostgreSQL-backed {@link PgSeasonCatalog}; a regression that re-introduces
 * the clock-derived catalog into composition would silently bypass the governed season source of
 * truth, so we fail closed here.
 */

const compositionSource = readFileSync(
  fileURLToPath(new URL('../../../src/http/composition.ts', import.meta.url)),
  'utf8',
);

describe('production Button composition (season catalog)', () => {
  it('does not reference the clock-derived season catalog', () => {
    expect(compositionSource).not.toContain('ClockDerivedSeasonCatalog');
  });

  it('wires the governed PostgreSQL season catalog', () => {
    expect(compositionSource).toContain('PgSeasonCatalog');
    expect(compositionSource).toContain('createPgSeasonCatalog');
    expect(compositionSource).toContain('SeasonCatalogService');
  });
});

import { TextEncoder } from 'node:util';
import { describe, expect, it } from 'vitest';

import { sha256EvidenceHasher, sha256Hex } from '../../../../src/governance/evidence/EvidenceHasher.js';

/**
 * Evidence hashing is the foundation of the hash-addressed, tamper-evident payload store.
 * These tests pin the algorithm (SHA-256) and prove digests are stable and content-sensitive.
 */
describe('EvidenceHasher', () => {
  const enc = new TextEncoder();

  // (1) Stable, well-known SHA-256 digests.
  it('computes a stable, well-known SHA-256 digest', () => {
    expect(sha256Hex(enc.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(enc.encode('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('is deterministic for identical content', () => {
    const a = sha256Hex(enc.encode('the-house-evidence'));
    const b = sha256Hex(enc.encode('the-house-evidence'));
    expect(a).toBe(b);
  });

  it('differs for different content', () => {
    expect(sha256Hex(enc.encode('a'))).not.toBe(sha256Hex(enc.encode('b')));
  });

  it('exposes a default hasher matching sha256Hex', () => {
    const bytes = enc.encode('evidence');
    expect(sha256EvidenceHasher.hash(bytes)).toBe(sha256Hex(bytes));
  });
});
